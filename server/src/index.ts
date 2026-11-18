import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { serve, type ServerType } from '@hono/node-server';
import {
  ChatSession,
  PermissionManager,
  Store,
  VERSION,
  conversationToMarkdown,
  getApiKey,
  getModelChain,
  loadConfig,
  loadSkills,
  maskKey,
  saveConfig,
  type PermissionDecision,
} from '@nexora/core';

export interface ServerOptions {
  port?: number;
  host?: string;
  cwd?: string;
  /** Pasta com o build da web (web/dist). */
  webDir?: string;
  store?: Store;
}

interface Run {
  abort: AbortController;
  pending: Map<string, (d: PermissionDecision) => void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function createApp(opts: ServerOptions = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const store = opts.store ?? new Store();
  const runs = new Map<string, Run>();
  const permsByConv = new Map<string, PermissionManager>();
  const app = new Hono();

  // ---- segurança: só localhost, sem CORS, header próprio contra CSRF ----
  app.use('*', async (c, next) => {
    const host = (c.req.header('host') ?? '').replace(/:\d+$/, '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return c.text('Acesso permitido só via localhost.', 403);
    if (c.req.path.startsWith('/api/') && c.req.method !== 'GET') {
      const origin = c.req.header('origin');
      if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) return c.text('Origem não permitida.', 403);
      if (c.req.header('x-nexora') !== '1') return c.text('Cabeçalho ausente.', 403);
    }
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
  });

  app.get('/api/state', (c) => {
    const cfg = loadConfig();
    const key = getApiKey(cfg);
    return c.json({
      version: VERSION,
      hasKey: !!key,
      keyFromEnv: !!process.env.GROQ_API_KEY,
      maskedKey: maskKey(key),
      model: getModelChain(cfg)[0],
      models: getModelChain(cfg),
      theme: cfg.theme ?? 'dark',
      userName: cfg.userName ?? '',
      cwd,
      skills: loadSkills(cwd).map(({ name, description, argumentHint }) => ({ name, description, argumentHint })),
    });
  });

  app.post('/api/config', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof body.apiKey === 'string') patch.apiKey = body.apiKey.trim();
    if (typeof body.model === 'string') patch.model = body.model.trim();
    if (body.theme === 'dark' || body.theme === 'light') patch.theme = body.theme;
    if (typeof body.userName === 'string') patch.userName = body.userName.trim().slice(0, 40);
    saveConfig(patch);
    return c.json({ ok: true });
  });

  /** Testa a chave fazendo uma chamada real e barata (lista de modelos). */
  app.post('/api/config/test', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { apiKey?: string };
    const key = body.apiKey?.trim() || getApiKey();
    if (!key) return c.json({ ok: false, message: 'Nenhuma chave informada.' });
    try {
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
      if (r.status === 401) return c.json({ ok: false, message: 'Chave inválida.' });
      if (!r.ok) return c.json({ ok: false, message: `A Groq respondeu ${r.status}.` });
      const data = (await r.json()) as { data?: { id: string }[] };
      return c.json({ ok: true, message: `Conexão OK — ${data.data?.length ?? 0} modelos disponíveis.`, models: data.data?.map((m) => m.id) ?? [] });
    } catch (err) {
      return c.json({ ok: false, message: `Falha de rede: ${(err as Error).message}` });
    }
  });

  app.get('/api/conversations', (c) => c.json(store.listConversations()));

  app.get('/api/conversations/:id', (c) => {
    const conv = store.getConversation(c.req.param('id'));
    if (!conv) return c.json({ error: 'Conversa não encontrada' }, 404);
    return c.json({ conversation: conv, messages: store.getMessages(conv.id) });
  });

  app.patch('/api/conversations/:id', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { title?: string };
    if (body.title?.trim()) store.renameConversation(c.req.param('id'), body.title.trim());
    return c.json({ ok: true });
  });

  app.delete('/api/conversations/:id', (c) => {
    store.deleteConversation(c.req.param('id'));
    permsByConv.delete(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.get('/api/conversations/:id/export', (c) => {
    const conv = store.getConversation(c.req.param('id'));
    if (!conv) return c.text('Conversa não encontrada', 404);
    c.header('Content-Type', 'text/markdown; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="nexora-${conv.id.slice(0, 8)}.md"`);
    return c.body(conversationToMarkdown(conv, store.getMessages(conv.id)));
  });

  app.post('/api/chat', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      conversationId?: string;
      text?: string;
      attachment?: string;
      regenerate?: boolean;
    };
    const text = (body.text ?? '').toString();
    if (!body.regenerate && !text.trim()) return c.json({ error: 'Mensagem vazia' }, 400);
    if (body.attachment && body.attachment.length > 300_000) return c.json({ error: 'Anexo grande demais (máx. ~300 KB de texto).' }, 413);

    const runId = crypto.randomUUID();
    const run: Run = { abort: new AbortController(), pending: new Map() };
    runs.set(runId, run);

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => run.abort.abort());
      const send = (data: unknown) => stream.writeSSE({ data: JSON.stringify(data) });
      await send({ type: 'run', runId });

      const convId = body.conversationId && store.getConversation(body.conversationId) ? body.conversationId : undefined;
      const perms = (convId && permsByConv.get(convId)) || new PermissionManager();
      const session = new ChatSession({ store, cwd, source: 'web', permissions: perms });
      if (convId) session.resume(convId);

      const ask = (req: { id: string }) =>
        new Promise<PermissionDecision>((resolve) => {
          run.pending.set(req.id, resolve);
          run.abort.signal.addEventListener('abort', () => resolve('no'), { once: true });
        });

      try {
        const events = body.regenerate
          ? session.regenerate(run.abort.signal, ask)
          : session.send(text, run.abort.signal, ask, { attachment: body.attachment });
        for await (const ev of events) {
          if (ev.type === 'conversation') permsByConv.set(ev.id, perms);
          await send(ev);
        }
      } catch (err) {
        await send({ type: 'error', message: `Erro no servidor: ${(err as Error).message}` });
        await send({ type: 'done', aborted: false });
      } finally {
        runs.delete(runId);
      }
    });
  });

  app.post('/api/runs/:runId/permission', async (c) => {
    const run = runs.get(c.req.param('runId'));
    const body = (await c.req.json().catch(() => ({}))) as { requestId?: string; decision?: PermissionDecision };
    const resolve = run && body.requestId ? run.pending.get(body.requestId) : undefined;
    if (!resolve || !body.decision || !['yes', 'always', 'no'].includes(body.decision)) return c.json({ ok: false }, 404);
    run!.pending.delete(body.requestId!);
    resolve(body.decision);
    return c.json({ ok: true });
  });

  app.post('/api/runs/:runId/cancel', (c) => {
    runs.get(c.req.param('runId'))?.abort.abort();
    return c.json({ ok: true });
  });

  /** Serve arquivos gerados em ./nexora-docs (ex.: PNG do cartaz). */
  app.get('/api/files/*', (c) => {
    const rel = decodeURIComponent(c.req.path.replace(/^\/api\/files\//, ''));
    const base = path.resolve(cwd, 'nexora-docs');
    const file = path.resolve(base, rel.replace(/^nexora-docs[\\/]/, ''));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) return c.text('Arquivo não encontrado', 404);
    c.header('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    return c.body(fs.readFileSync(file));
  });

  app.all('/api/*', (c) => c.json({ error: 'Rota não encontrada' }, 404));

  // ---- web estática (SPA) ----
  app.get('*', (c) => {
    const webDir = opts.webDir;
    if (!webDir || !fs.existsSync(path.join(webDir, 'index.html'))) {
      return c.html('<h1>Nexora AI</h1><p>O build da web não foi encontrado. Rode <code>pnpm build</code> na pasta do projeto.</p>', 500);
    }
    const reqPath = decodeURIComponent(c.req.path);
    let file = path.resolve(webDir, '.' + reqPath);
    if (!file.startsWith(path.resolve(webDir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(webDir, 'index.html');
    }
    const ext = path.extname(file);
    c.header('Content-Type', MIME[ext] ?? 'application/octet-stream');
    if (reqPath.startsWith('/assets/')) c.header('Cache-Control', 'public, max-age=31536000, immutable');
    return c.body(fs.readFileSync(file));
  });

  return { app, store };
}

export function startServer(opts: ServerOptions = {}): Promise<{ url: string; server: ServerType }> {
  const { app } = createApp(opts);
  const port = opts.port ?? 4173;
  const host = opts.host ?? '127.0.0.1';
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
      resolve({ url: `http://localhost:${info.port}`, server });
    });
    server.on('error', reject);
  });
}
