import type { AgentEvent, Conversation, PermissionDecision, SkillInfo, StoredMessage } from '@nexora/core/types';

export interface ServerState {
  version: string;
  hasKey: boolean;
  keyFromEnv: boolean;
  maskedKey: string;
  model: string;
  models: string[];
  theme: 'dark' | 'light';
  userName: string;
  cwd: string;
  skills: SkillInfo[];
}

export type StreamEvent = AgentEvent | { type: 'run'; runId: string } | { type: 'conversation'; id: string; title: string };

const HEADERS = { 'Content-Type': 'application/json', 'X-Nexora': '1' };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  state: () => fetch('/api/state').then((r) => json<ServerState>(r)),
  saveConfig: (patch: Partial<{ apiKey: string; model: string; theme: string; userName: string }>) =>
    fetch('/api/config', { method: 'POST', headers: HEADERS, body: JSON.stringify(patch) }).then((r) => json<{ ok: boolean }>(r)),
  testKey: (apiKey?: string) =>
    fetch('/api/config/test', { method: 'POST', headers: HEADERS, body: JSON.stringify({ apiKey }) }).then((r) =>
      json<{ ok: boolean; message: string; models?: string[] }>(r),
    ),
  conversations: () => fetch('/api/conversations').then((r) => json<Conversation[]>(r)),
  conversation: (id: string) => fetch(`/api/conversations/${id}`).then((r) => json<{ conversation: Conversation; messages: StoredMessage[] }>(r)),
  rename: (id: string, title: string) =>
    fetch(`/api/conversations/${id}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify({ title }) }).then((r) => json(r)),
  remove: (id: string) => fetch(`/api/conversations/${id}`, { method: 'DELETE', headers: HEADERS }).then((r) => json(r)),
  exportUrl: (id: string) => `/api/conversations/${id}/export`,
  permission: (runId: string, requestId: string, decision: PermissionDecision) =>
    fetch(`/api/runs/${runId}/permission`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ requestId, decision }) }),
  cancel: (runId: string) => fetch(`/api/runs/${runId}/cancel`, { method: 'POST', headers: HEADERS }),

  /** POST /api/chat com resposta SSE; chama onEvent para cada evento. */
  async chat(
    body: { conversationId?: string | null; text?: string; attachment?: string; regenerate?: boolean },
    onEvent: (e: StreamEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const res = await fetch('/api/chat', { method: 'POST', headers: HEADERS, body: JSON.stringify(body), signal });
    if (!res.ok || !res.body) {
      let msg = `Erro ${res.status}`;
      try {
        msg = (await res.json()).error ?? msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).replace(/^ /, ''))
          .join('\n');
        if (!data) continue;
        try {
          onEvent(JSON.parse(data));
        } catch {
          /* evento inválido */
        }
      }
    }
  },
};
