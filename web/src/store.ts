import { create } from 'zustand';
import type { Artifact, Conversation, PermissionDecision, PermissionRequest, StoredMessage, Todo } from '@nexora/core/types';
import { api, type ServerState } from './api';

export type LivePart =
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; title: string; status: 'running' | 'ok' | 'error'; output?: string; summary?: string; diff?: string; artifact?: Artifact }
  | { type: 'permission'; request: PermissionRequest; decided?: PermissionDecision };

export interface Live {
  userText?: string;
  parts: LivePart[];
  todos: Todo[];
  notices: string[];
  error?: string;
}

interface AppState {
  info: ServerState | null;
  infoError: string | null;
  conversations: Conversation[];
  currentId: string | null;
  messages: StoredMessage[];
  loadingConv: boolean;
  live: Live | null;
  running: boolean;
  runId: string | null;
  lastError: string | null;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  artifact: Artifact | null;
  theme: 'dark' | 'light';
  announce: string;

  init: () => Promise<void>;
  refreshInfo: () => Promise<void>;
  loadConversations: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  newChat: () => void;
  send: (text: string, attachment?: string) => Promise<void>;
  regenerate: () => Promise<void>;
  stop: () => void;
  decide: (requestId: string, decision: PermissionDecision) => void;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setTheme: (t: 'dark' | 'light') => void;
  setSidebar: (open: boolean) => void;
  setSettings: (open: boolean) => void;
  openArtifact: (a: Artifact | null) => void;
}

let abortCtl: AbortController | null = null;

function applyTheme(t: 'dark' | 'light') {
  const el = document.documentElement;
  el.classList.remove('dark', 'light');
  el.classList.add(t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#111312' : '#FAF9F6');
  try {
    localStorage.setItem('nexora-theme', t);
  } catch {
    /* modo privado */
  }
}

function initialTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem('nexora-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export const useStore = create<AppState>((set, get) => ({
  info: null,
  infoError: null,
  conversations: [],
  currentId: null,
  messages: [],
  loadingConv: false,
  live: null,
  running: false,
  runId: null,
  lastError: null,
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 900 : true,
  settingsOpen: false,
  artifact: null,
  theme: initialTheme(),
  announce: '',

  async init() {
    applyTheme(get().theme);
    await get().refreshInfo();
    await get().loadConversations();
    const m = /^#\/c\/([\w-]+)/.exec(location.hash);
    if (m) await get().openConversation(m[1]);
  },

  async refreshInfo() {
    try {
      const info = await api.state();
      set({ info, infoError: null });
    } catch (err) {
      set({ infoError: `Não foi possível falar com o servidor local (${(err as Error).message}). Ele está rodando? Use "nexora web".` });
    }
  },

  async loadConversations() {
    try {
      set({ conversations: await api.conversations() });
    } catch {
      /* servidor fora do ar: o banner de erro já aparece */
    }
  },

  async openConversation(id) {
    if (get().running) get().stop();
    set({ loadingConv: true, currentId: id, live: null, lastError: null, artifact: null });
    try {
      const { messages } = await api.conversation(id);
      set({ messages, loadingConv: false });
      history.replaceState(null, '', `#/c/${id}`);
    } catch {
      set({ loadingConv: false, currentId: null, messages: [] });
      history.replaceState(null, '', '#/');
    }
    if (window.innerWidth < 900) set({ sidebarOpen: false });
  },

  newChat() {
    if (get().running) get().stop();
    set({ currentId: null, messages: [], live: null, lastError: null, artifact: null });
    history.replaceState(null, '', '#/');
    if (window.innerWidth < 900) set({ sidebarOpen: false });
  },

  async send(text, attachment) {
    await run({ conversationId: get().currentId, text, attachment }, text);
  },

  async regenerate() {
    const id = get().currentId;
    if (!id) return;
    // remove localmente a última resposta para não piscar
    const msgs = get().messages;
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    if (lastUser) set({ messages: msgs.filter((m) => m.id <= lastUser.id) });
    await run({ conversationId: id, regenerate: true });
  },

  stop() {
    const { runId } = get();
    if (runId) void api.cancel(runId);
    abortCtl?.abort();
  },

  decide(requestId, decision) {
    const { runId, live } = get();
    if (!runId || !live) return;
    void api.permission(runId, requestId, decision);
    set({
      live: {
        ...live,
        parts: live.parts.map((p) => (p.type === 'permission' && p.request.id === requestId ? { ...p, decided: decision } : p)),
      },
    });
  },

  async rename(id, title) {
    await api.rename(id, title);
    await get().loadConversations();
  },

  async remove(id) {
    await api.remove(id);
    if (get().currentId === id) get().newChat();
    await get().loadConversations();
  },

  setTheme(t) {
    applyTheme(t);
    set({ theme: t });
    void api.saveConfig({ theme: t }).catch(() => {});
  },
  setSidebar: (open) => set({ sidebarOpen: open }),
  setSettings: (open) => set({ settingsOpen: open }),
  openArtifact: (a) => set({ artifact: a }),
}));

/** Executa uma rodada de chat por SSE, atualizando `live` com os eventos. */
async function run(body: { conversationId: string | null; text?: string; attachment?: string; regenerate?: boolean }, userText?: string) {
  const st = useStore.getState();
  if (st.running) return;
  abortCtl = new AbortController();
  const live: Live = { userText, parts: [], todos: [], notices: [] };
  useStore.setState({ running: true, live, lastError: null, announce: '' });

  const update = (fn: (l: Live) => Live) => {
    const cur = useStore.getState().live;
    if (cur) useStore.setState({ live: fn(cur) });
  };
  let convId = body.conversationId;
  let pendingText = '';
  let raf = 0;
  const flushText = () => {
    raf = 0;
    if (!pendingText) return;
    const t = pendingText;
    pendingText = '';
    update((l) => {
      const parts = [...l.parts];
      const last = parts[parts.length - 1];
      if (last?.type === 'text') parts[parts.length - 1] = { type: 'text', text: last.text + t };
      else parts.push({ type: 'text', text: t });
      return { ...l, parts };
    });
  };

  try {
    await api.chat(
      body,
      (ev) => {
        switch (ev.type) {
          case 'run':
            useStore.setState({ runId: ev.runId });
            break;
          case 'conversation':
            convId = ev.id;
            useStore.setState({ currentId: ev.id });
            history.replaceState(null, '', `#/c/${ev.id}`);
            void useStore.getState().loadConversations();
            break;
          case 'text':
            pendingText += ev.delta;
            if (!raf) raf = requestAnimationFrame(flushText);
            break;
          case 'tool_start':
            flushText();
            update((l) => ({ ...l, parts: [...l.parts, { type: 'tool', id: ev.id, name: ev.name, title: ev.title, status: 'running' }] }));
            break;
          case 'permission':
            flushText();
            update((l) => ({ ...l, parts: [...l.parts, { type: 'permission', request: ev.request }] }));
            break;
          case 'tool_end':
            update((l) => ({
              ...l,
              parts: l.parts
                .filter((p) => !(p.type === 'permission' && p.request.id === ev.id))
                .map((p) =>
                  p.type === 'tool' && p.id === ev.id
                    ? { ...p, status: ev.isError ? 'error' : 'ok', output: ev.output, summary: ev.display?.summary, diff: ev.display?.diff, artifact: ev.display?.artifact }
                    : p,
                ),
            }));
            break;
          case 'artifact':
            useStore.setState({ artifact: ev.artifact });
            break;
          case 'todos':
            update((l) => ({ ...l, todos: ev.todos }));
            break;
          case 'model':
            update((l) => ({ ...l, notices: [...l.notices, `Trocando para ${ev.model} (${ev.reason})`] }));
            break;
          case 'error':
            flushText();
            update((l) => ({ ...l, error: ev.message }));
            break;
          case 'done':
            flushText();
            break;
        }
      },
      abortCtl.signal,
    );
  } catch (err) {
    if ((err as Error).name !== 'AbortError') update((l) => ({ ...l, error: (err as Error).message }));
  } finally {
    if (raf) cancelAnimationFrame(raf);
    flushText();
    const error = useStore.getState().live?.error ?? null;
    // recarrega do banco: a conversa salva é a fonte da verdade
    if (convId) {
      try {
        const { messages } = await api.conversation(convId);
        useStore.setState({ messages });
      } catch {
        /* mantém o que tem */
      }
    }
    useStore.setState({ running: false, runId: null, live: null, lastError: error, announce: 'Resposta concluída.' });
    void useStore.getState().loadConversations();
    abortCtl = null;
  }
}
