import type { ChatMessage, ToolCall } from './types';
import { GROQ_BASE_URL } from './config';

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ProviderEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_calls'; calls: ToolCall[] }
  | { type: 'usage'; promptTokens: number; completionTokens: number };

export interface StreamRequest {
  model: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  signal?: AbortSignal;
}

export interface Provider {
  stream(req: StreamRequest): AsyncIterable<ProviderEvent>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  /** Erros em que vale a pena tentar outro modelo. */
  get shouldFallback(): boolean {
    return (
      this.status === 429 ||
      this.status >= 500 ||
      this.status === 404 ||
      this.code === 'model_decommissioned' ||
      this.code === 'model_not_found' ||
      this.code === 'tool_use_failed'
    );
  }
}

/** Converte nossas mensagens para o formato OpenAI/Groq. */
export function toOpenAIMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.arguments || '{}' },
        })),
      };
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

/** Lê um corpo SSE e devolve cada payload `data:`. */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (line.startsWith('data:')) yield line.slice(5).trim();
      }
    }
    if (buffer.startsWith('data:')) yield buffer.slice(5).trim();
  } finally {
    reader.releaseLock();
  }
}

interface ChunkToolCall {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

/** Provider da Groq (API compatível com OpenAI), via fetch + SSE. */
export class GroqProvider implements Provider {
  constructor(
    private apiKey: string,
    private baseUrl: string = GROQ_BASE_URL,
  ) {}

  async *stream(req: StreamRequest): AsyncGenerator<ProviderEvent> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOpenAIMessages(req.messages),
      stream: true,
      temperature: 0.6,
    };
    if (req.tools.length > 0) {
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = 'auto';
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (err) {
      if (req.signal?.aborted) throw err;
      throw new ProviderError(`Não foi possível conectar à Groq (${(err as Error).message}). Verifique sua internet.`, 503);
    }

    if (!res.ok || !res.body) {
      let message = `Erro ${res.status} da Groq`;
      let code: string | undefined;
      try {
        const data = (await res.json()) as { error?: { message?: string; code?: string } };
        if (data.error?.message) message = data.error.message;
        code = data.error?.code;
      } catch {
        /* corpo não-JSON */
      }
      if (res.status === 401) message = 'Chave da Groq inválida. Configure uma nova chave (GROQ_API_KEY ou /config).';
      throw new ProviderError(message, res.status, code);
    }

    const calls = new Map<number, { id: string; name: string; arguments: string }>();
    for await (const data of readSSE(res.body)) {
      if (data === '[DONE]') break;
      let chunk: any;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) {
        throw new ProviderError(chunk.error.message || 'Erro no streaming', 500, chunk.error.code);
      }
      const choice = chunk.choices?.[0];
      const delta = choice?.delta ?? {};
      const reasoning = delta.reasoning ?? delta.reasoning_content;
      if (typeof reasoning === 'string' && reasoning) yield { type: 'reasoning', delta: reasoning };
      if (typeof delta.content === 'string' && delta.content) yield { type: 'text', delta: delta.content };
      for (const tc of (delta.tool_calls ?? []) as ChunkToolCall[]) {
        const cur = calls.get(tc.index) ?? { id: '', name: '', arguments: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.arguments += tc.function.arguments;
        calls.set(tc.index, cur);
      }
      const usage = chunk.usage ?? chunk.x_groq?.usage;
      if (usage) {
        yield {
          type: 'usage',
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
        };
      }
    }
    if (calls.size > 0) {
      const list = [...calls.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([i, c]) => ({ id: c.id || `call_${Date.now()}_${i}`, name: c.name, arguments: c.arguments }));
      yield { type: 'tool_calls', calls: list };
    }
  }
}
