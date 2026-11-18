import type { AgentEvent, ChatMessage, PermissionDecision, PermissionRequest, ToolCall } from './types';
import type { Provider, ToolSpec } from './provider';
import { ProviderError } from './provider';
import type { Tool, ToolContext } from './tools/types';
import { PermissionManager } from './permissions';

export interface AgentOptions {
  provider: Provider;
  /** Lista de modelos em ordem de preferência (fallback automático). */
  models: string[];
  tools: Tool[];
  systemPrompt: string;
  cwd: string;
  signal: AbortSignal;
  permissions: PermissionManager;
  /** Chamado quando uma ferramenta precisa de aprovação. */
  askPermission: (req: PermissionRequest) => Promise<PermissionDecision>;
  maxSteps?: number;
  /** Espera entre tentativas (ms). Testes usam 0. */
  retryDelayMs?: number;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

function isAbort(err: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (err as Error)?.name === 'AbortError';
}

export function friendlyError(err: unknown): string {
  if (err instanceof ProviderError) {
    if (err.status === 429) return 'Limite gratuito da Groq atingido em todos os modelos da lista. Aguarde um pouco e tente de novo.';
    if (err.status === 401) return err.message;
    return `Erro da Groq: ${err.message}`;
  }
  return `Erro inesperado: ${(err as Error)?.message ?? String(err)}`;
}

function parseArgs(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || !raw.trim()) return { ok: true, value: {} };
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return { ok: true, value: v };
    return { ok: false, error: 'Os argumentos precisam ser um objeto JSON.' };
  } catch {
    return { ok: false, error: 'Argumentos em JSON inválido. Envie um objeto JSON válido.' };
  }
}

/**
 * Loop do agente: chama o modelo em streaming; se ele pedir ferramentas,
 * pede permissão quando necessário, executa, devolve os resultados e continua
 * até o modelo responder sem pedir ferramentas.
 *
 * `history` deve conter as mensagens anteriores + a nova mensagem do usuário
 * (sem o system prompt). Cada mensagem nova é emitida em um evento `message`.
 */
export async function* runAgent(history: ChatMessage[], opts: AgentOptions): AsyncGenerator<AgentEvent> {
  const { provider, tools, signal } = opts;
  const messages: ChatMessage[] = [...history];
  const specs: ToolSpec[] = tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  const byName = new Map(tools.map((t) => [t.name, t]));
  const maxSteps = opts.maxSteps ?? 30;
  const retryDelay = opts.retryDelayMs ?? 1500;
  let modelIdx = 0;
  const pending: AgentEvent[] = [];
  const ctx: ToolContext = { cwd: opts.cwd, signal, emit: (e) => pending.push(e) };

  for (let step = 0; step < maxSteps; step++) {
    let text = '';
    let calls: ToolCall[] = [];
    let attempt = 0;

    // ---- chamada ao modelo, com retry e fallback ----
    while (true) {
      const model = opts.models[modelIdx];
      text = '';
      calls = [];
      try {
        for await (const ev of provider.stream({
          model,
          messages: [{ role: 'system', content: opts.systemPrompt }, ...messages],
          tools: specs,
          signal,
        })) {
          if (signal.aborted) break;
          if (ev.type === 'text') {
            text += ev.delta;
            yield { type: 'text', delta: ev.delta };
          } else if (ev.type === 'reasoning') {
            yield { type: 'reasoning', delta: ev.delta };
          } else if (ev.type === 'tool_calls') {
            calls = ev.calls;
          } else if (ev.type === 'usage') {
            yield ev;
          }
        }
        break;
      } catch (err) {
        if (isAbort(err, signal)) break;
        const canRetry = err instanceof ProviderError && err.shouldFallback && text.length === 0;
        if (!canRetry) {
          if (text) {
            const partial: ChatMessage = { role: 'assistant', content: text };
            messages.push(partial);
            yield { type: 'message', message: partial };
          }
          yield { type: 'error', message: friendlyError(err) };
          yield { type: 'done', aborted: false };
          return;
        }
        const pe = err as ProviderError;
        attempt++;
        // tool_use_failed: o modelo gerou uma chamada malformada; tenta de novo o mesmo modelo uma vez.
        if (pe.code === 'tool_use_failed' && attempt === 1) continue;
        if (modelIdx < opts.models.length - 1) {
          modelIdx++;
          attempt = 0;
          yield {
            type: 'model',
            model: opts.models[modelIdx],
            reason: pe.status === 429 ? `limite atingido em ${model}` : `${model} indisponível (${pe.message})`,
          };
          continue;
        }
        // último modelo: espera e tenta mais algumas vezes em caso de 429/5xx
        if (attempt <= 2 && (pe.status === 429 || pe.status >= 500)) {
          yield { type: 'model', model, reason: `aguardando para tentar de novo (${attempt}/2)` };
          await sleep(retryDelay * Math.pow(2, attempt - 1), signal);
          if (signal.aborted) break;
          continue;
        }
        yield { type: 'error', message: friendlyError(err) };
        yield { type: 'done', aborted: false };
        return;
      }
    }

    if (signal.aborted) {
      if (text) {
        const partial: ChatMessage = { role: 'assistant', content: text };
        yield { type: 'message', message: partial };
      }
      yield { type: 'done', aborted: true };
      return;
    }

    const assistant: ChatMessage = { role: 'assistant', content: text };
    if (calls.length > 0) assistant.toolCalls = calls;
    messages.push(assistant);
    yield { type: 'message', message: assistant };

    if (calls.length === 0) {
      yield { type: 'done', aborted: false };
      return;
    }

    // ---- execução das ferramentas ----
    for (let ci = 0; ci < calls.length; ci++) {
      const call = calls[ci];
      const tool = byName.get(call.name);
      const parsed = parseArgs(call.arguments);
      const input = parsed.ok ? parsed.value : {};
      let title = call.name;
      try {
        if (tool) title = tool.title(input as any) || call.name;
      } catch {
        /* título é só cosmético */
      }
      yield { type: 'tool_start', id: call.id, name: call.name, title, input };

      let output: string;
      let isError = false;
      let display;

      if (signal.aborted) {
        output = 'Cancelado pelo usuário.';
        isError = true;
      } else if (!tool) {
        output = `Ferramenta desconhecida: ${call.name}. Use apenas: ${[...byName.keys()].join(', ')}.`;
        isError = true;
      } else if (!parsed.ok) {
        output = parsed.error;
        isError = true;
      } else {
        let allowed = true;
        if (tool.needsPermission && !opts.permissions.isAllowed(tool.name)) {
          let preview: { title: string; diff?: string; command?: string } = { title: `${tool.name}(${title})` };
          try {
            if (tool.preview) preview = await tool.preview(input as any, ctx);
          } catch {
            /* mostra só o título */
          }
          const request: PermissionRequest = { id: call.id, tool: tool.name, ...preview };
          yield { type: 'permission', request };
          const decision = await opts.askPermission(request);
          opts.permissions.record(tool.name, decision);
          allowed = decision !== 'no';
        }
        if (signal.aborted) {
          output = 'Cancelado pelo usuário.';
          isError = true;
        } else if (!allowed) {
          output = 'O usuário NEGOU esta ação. Não tente de novo da mesma forma; pergunte o que ele prefere fazer.';
          isError = true;
        } else {
          try {
            const r = await tool.run(input as any, ctx);
            output = r.output;
            isError = !!r.isError;
            display = r.display;
          } catch (err) {
            output = `Erro ao executar ${tool.name}: ${(err as Error).message}`;
            isError = true;
          }
        }
      }

      while (pending.length) yield pending.shift()!;
      yield { type: 'tool_end', id: call.id, name: call.name, output, isError, display };
      const toolMsg: ChatMessage = {
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: output,
        isError,
        toolDisplay: display ?? { title },
      };
      if (display && !display.title) toolMsg.toolDisplay = { ...display, title };
      messages.push(toolMsg);
      yield { type: 'message', message: toolMsg };
    }

    if (signal.aborted) {
      yield { type: 'done', aborted: true };
      return;
    }
  }

  yield { type: 'error', message: 'Limite de etapas atingido nesta resposta. Peça para continuar se precisar.' };
  yield { type: 'done', aborted: false };
}
