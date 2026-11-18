import type { AgentEvent, ChatMessage, PermissionDecision, PermissionRequest } from './types';
import { runAgent } from './agent';
import type { Provider } from './provider';
import { GroqProvider } from './provider';
import { PermissionManager } from './permissions';
import { Store, toHistory, titleFrom } from './db';
import { buildSystemPrompt } from './prompt';
import { loadSkills, resolveSkillInput, type Skill } from './skills';
import { defaultTools } from './tools/index';
import type { Tool } from './tools/types';
import { getApiKey, getModelChain, loadConfig } from './config';

export interface ChatSessionOptions {
  store: Store;
  cwd: string;
  source: 'cli' | 'web';
  provider?: Provider;
  tools?: Tool[];
  models?: string[];
  permissions?: PermissionManager;
}

/** Cria o provider da Groq com a chave configurada (ou lança erro amigável). */
export function createProvider(): Provider {
  const key = getApiKey();
  if (!key) throw new Error('Nenhuma chave da Groq configurada. Defina GROQ_API_KEY ou salve a chave em ~/.nexora/config.json.');
  // GROQ_BASE_URL permite apontar para outro endpoint compatível (útil em testes).
  return new GroqProvider(key, process.env.GROQ_BASE_URL || undefined);
}

/**
 * Uma conversa persistida: junta banco + skills + agente.
 * Usada pelo CLI e pelo servidor web (mesmo código).
 */
export class ChatSession {
  conversationId: string | null = null;
  permissions: PermissionManager;
  skills: Skill[];
  models: string[];
  private opts: ChatSessionOptions;

  constructor(opts: ChatSessionOptions) {
    this.opts = opts;
    this.permissions = opts.permissions ?? new PermissionManager();
    this.skills = loadSkills(opts.cwd);
    this.models = opts.models ?? getModelChain(loadConfig());
  }

  get store(): Store {
    return this.opts.store;
  }

  get model(): string {
    return this.models[0];
  }

  setModel(model: string): void {
    this.models = [model, ...this.models.filter((m) => m !== model)];
  }

  reloadSkills(): void {
    this.skills = loadSkills(this.opts.cwd);
  }

  newConversation(): void {
    this.conversationId = null;
    this.permissions.reset();
  }

  resume(id: string): boolean {
    const conv = this.opts.store.findConversation(id);
    if (!conv) return false;
    this.conversationId = conv.id;
    return true;
  }

  /** Envia uma mensagem do usuário (aceita /skill) e roda o agente, salvando tudo no banco. */
  async *send(
    text: string,
    signal: AbortSignal,
    askPermission: (req: PermissionRequest) => Promise<PermissionDecision>,
    opts: { regenerate?: boolean; attachment?: string } = {},
  ): AsyncGenerator<AgentEvent | { type: 'conversation'; id: string; title: string }> {
    const store = this.opts.store;
    if (!opts.regenerate) {
      const { prompt, skill } = resolveSkillInput(text, this.skills);
      const content = opts.attachment ? `${prompt}\n\n${opts.attachment}` : prompt;
      if (!this.conversationId) {
        const conv = store.createConversation(titleFrom(text), this.opts.source);
        this.conversationId = conv.id;
        yield { type: 'conversation', id: conv.id, title: conv.title };
      }
      const userMsg: ChatMessage = { role: 'user', content };
      if (skill || opts.attachment) userMsg.display = text + (opts.attachment ? '\n\n📎 arquivo anexado' : '');
      store.addMessage(this.conversationId, userMsg);
    } else if (!this.conversationId) {
      return;
    }

    const convId = this.conversationId!;
    const history = toHistory(store.getMessages(convId));
    let provider: Provider;
    try {
      provider = this.opts.provider ?? createProvider();
    } catch (err) {
      yield { type: 'error', message: (err as Error).message };
      yield { type: 'done', aborted: false };
      return;
    }

    const events = runAgent(history, {
      provider,
      models: this.models,
      tools: this.opts.tools ?? defaultTools(),
      systemPrompt: buildSystemPrompt({ cwd: this.opts.cwd, interface: this.opts.source }),
      cwd: this.opts.cwd,
      signal,
      permissions: this.permissions,
      askPermission,
    });
    for await (const ev of events) {
      if (ev.type === 'message') store.addMessage(convId, ev.message);
      if (ev.type === 'model' && !ev.reason.startsWith('aguardando')) this.setModel(ev.model);
      yield ev;
    }
  }

  /** Remove a última resposta (tudo depois da última mensagem do usuário) e gera de novo. */
  regenerate(signal: AbortSignal, askPermission: (req: PermissionRequest) => Promise<PermissionDecision>) {
    const id = this.conversationId;
    if (id) {
      const msgs = this.opts.store.getMessages(id);
      const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
      if (lastUser) this.opts.store.truncateAfter(id, lastUser.id);
    }
    return this.send('', signal, askPermission, { regenerate: true });
  }
}
