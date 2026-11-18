import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronRight, FileText, Image as ImageIcon, RefreshCw, ShieldQuestion, Wrench } from 'lucide-react';
import type { Artifact, PermissionDecision, PermissionRequest, StoredMessage, Todo, ToolCall } from '@nexora/core/types';
import { useStore, type LivePart } from '../store';
import { CopyButton, Markdown } from './Markdown';
import { Composer } from './Composer';
import { LogoMark } from './Logo';

const TOOL_LABEL: Record<string, string> = {
  Read: 'Lendo',
  Write: 'Criando arquivo',
  Edit: 'Editando',
  Bash: 'Executando comando',
  Glob: 'Procurando arquivos',
  Grep: 'Buscando texto',
  WebFetch: 'Lendo página',
  TodoWrite: 'Atualizando tarefas',
  Finance: 'Calculando',
  Poster: 'Criando cartaz',
};

/** Detecta respostas longas/estruturadas que merecem abrir no painel de artefatos. */
export function docArtifact(text: string, id: string): Artifact | null {
  const headings = (text.match(/^#{1,3} .+/gm) ?? []).length;
  const hasTable = /^\|.+\|\s*$/m.test(text) && /^\|?\s*:?-{3,}/m.test(text);
  if (!((headings >= 2 && text.length > 600) || (hasTable && text.length > 300))) return null;
  const title = /^#{1,3} (.+)$/m.exec(text)?.[1]?.replace(/[*_`]/g, '').trim() ?? 'Documento';
  return { id, title, kind: 'markdown', content: text };
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const { openArtifact, artifact: open } = useStore();
  const active = open?.id === artifact.id;
  return (
    <button
      type="button"
      onClick={() => openArtifact(active ? null : artifact)}
      className={`mt-3 flex w-full max-w-md items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${active ? 'border-lime/60 bg-lime/10' : 'border-line bg-surface hover:bg-elevated'}`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-elevated text-lime-text">
        {artifact.kind === 'svg' ? <ImageIcon size={18} aria-hidden /> : <FileText size={18} aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{artifact.title}</span>
        <span className="block text-xs text-muted">{active ? 'Aberto no painel' : `${artifact.kind === 'svg' ? 'Cartaz' : 'Documento'} · clique para abrir`}</span>
      </span>
    </button>
  );
}

interface ToolView {
  id: string;
  name: string;
  title: string;
  status: 'running' | 'ok' | 'error';
  output?: string;
  summary?: string;
  diff?: string;
  artifact?: Artifact;
  input?: string;
}

function DiffBlock({ diff }: { diff: string }) {
  const lines = diff.split('\n').filter((l) => !l.startsWith('---') && !l.startsWith('+++'));
  return (
    <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-bg p-2 font-mono text-xs leading-relaxed">
      {lines.map((l, i) => (
        <div
          key={i}
          className={
            l.startsWith('+') ? 'bg-green-500/10 text-green-600 dark:text-green-300' : l.startsWith('-') ? 'bg-red-500/10 text-red-600 dark:text-red-300' : l.startsWith('@@') ? 'text-muted' : ''
          }
        >
          {l || ' '}
        </div>
      ))}
    </pre>
  );
}

function ToolBlock({ tool }: { tool: ToolView }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABEL[tool.name] ?? tool.name;
  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left text-sm text-muted hover:text-fg"
      >
        {tool.status === 'running' ? (
          <span className="h-2 w-2 shrink-0 animate-pulse2 rounded-full bg-lime" aria-hidden />
        ) : tool.status === 'error' ? (
          <AlertTriangle size={14} className="shrink-0 text-red-500" aria-hidden />
        ) : (
          <Wrench size={14} className="shrink-0 text-lime-text" aria-hidden />
        )}
        <span className="min-w-0 shrink-0 truncate">
          {label}
          {tool.status === 'running' ? '…' : ''} <span className="font-mono text-xs opacity-80">{tool.title}</span>
        </span>
        {tool.summary && tool.status !== 'running' && <span className="hidden max-w-[45%] shrink truncate text-xs sm:inline">· {tool.summary}</span>}
        <ChevronRight size={14} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-2 space-y-2 animate-fadein">
          {tool.input && (
            <pre className="max-h-48 overflow-auto rounded-lg border border-line bg-bg p-2 font-mono text-xs text-muted">{tool.input}</pre>
          )}
          {tool.diff && <DiffBlock diff={tool.diff} />}
          {tool.output && !tool.diff && (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-bg p-2 font-mono text-xs">{tool.output}</pre>
          )}
        </div>
      )}
      {tool.artifact && <ArtifactCard artifact={tool.artifact} />}
    </div>
  );
}

function PermissionCard({ request, decided }: { request: PermissionRequest; decided?: PermissionDecision }) {
  const decide = useStore((s) => s.decide);
  return (
    <div className="my-3 rounded-2xl border border-lime/50 bg-surface p-4 animate-fadein" role="group" aria-label={`Pedido de permissão: ${request.tool}`}>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <ShieldQuestion size={16} className="text-lime-text" aria-hidden />
        Permitir {request.tool}?
      </div>
      <p className="mb-2 text-sm text-muted">{request.title}</p>
      {request.command && <pre className="mb-2 overflow-x-auto rounded-lg border border-line bg-bg p-2 font-mono text-xs">{request.command}</pre>}
      {request.diff && <DiffBlock diff={request.diff} />}
      {decided ? (
        <p className="mt-2 text-sm text-muted">{decided === 'no' ? 'Você negou.' : 'Permitido.'}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" autoFocus onClick={() => decide(request.id, 'yes')} className="rounded-xl bg-lime px-3.5 py-1.5 text-sm font-medium text-on-lime hover:opacity-90">
            Sim
          </button>
          <button type="button" onClick={() => decide(request.id, 'always')} className="rounded-xl border border-line px-3.5 py-1.5 text-sm hover:bg-elevated">
            Sim, nesta conversa
          </button>
          <button type="button" onClick={() => decide(request.id, 'no')} className="rounded-xl border border-line px-3.5 py-1.5 text-sm hover:bg-elevated">
            Não
          </button>
        </div>
      )}
    </div>
  );
}

function TodoBox({ todos }: { todos: Todo[] }) {
  if (!todos.length) return null;
  return (
    <div className="my-3 rounded-xl border border-line bg-surface p-3 text-sm">
      <p className="mb-1.5 text-xs font-medium text-muted">Tarefas</p>
      <ul className="space-y-1">
        {todos.map((t, i) => (
          <li key={i} className={`flex items-start gap-2 ${t.status === 'completed' ? 'text-muted line-through' : t.status === 'in_progress' ? 'font-medium text-lime-text' : ''}`}>
            <span aria-hidden>{t.status === 'completed' ? '☒' : '☐'}</span>
            <span>{t.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Turn = { user: StoredMessage; items: (StoredMessage | { kind: 'tool'; call: ToolCall; result?: StoredMessage })[] };

function buildTurns(messages: StoredMessage[]): { turns: Turn[]; lastTodos: Todo[] } {
  const turns: Turn[] = [];
  const results = new Map(messages.filter((m) => m.role === 'tool').map((m) => [m.toolCallId, m]));
  let lastTodos: Todo[] = [];
  for (const m of messages) {
    if (m.role === 'user') turns.push({ user: m, items: [] });
    else if (m.role === 'assistant') {
      const t = turns[turns.length - 1];
      if (!t) continue;
      if (m.content.trim()) t.items.push(m);
      for (const call of m.toolCalls ?? []) {
        t.items.push({ kind: 'tool', call, result: results.get(call.id) });
        if (call.name === 'TodoWrite') {
          try {
            lastTodos = JSON.parse(call.arguments).todos ?? lastTodos;
          } catch {
            /* ignore */
          }
        }
      }
    }
  }
  return { turns, lastTodos };
}

function prettyArgs(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end animate-fadein">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-elevated px-4 py-2.5 text-[15px] leading-relaxed">{text}</div>
    </div>
  );
}

function AssistantText({ text, id, streaming }: { text: string; id: string; streaming?: boolean }) {
  const artifact = !streaming ? docArtifact(text, id) : null;
  return (
    <div className="text-[15px]">
      <Markdown text={text} streaming={streaming} />
      {artifact && <ArtifactCard artifact={artifact} />}
    </div>
  );
}

function LiveParts({ parts }: { parts: LivePart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.type === 'text' ? (
          <AssistantText key={i} id={`live-${i}`} text={p.text} streaming={i === parts.length - 1} />
        ) : p.type === 'tool' ? (
          <ToolBlock key={p.id} tool={p} />
        ) : (
          <PermissionCard key={`perm-${p.request.id}`} request={p.request} decided={p.decided} />
        ),
      )}
    </>
  );
}

export function ChatView() {
  const { messages, live, running, lastError, regenerate, loadingConv } = useStore();
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const { turns, lastTodos } = useMemo(() => buildTurns(messages), [messages]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const lastTurnIdx = turns.length - 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] space-y-6 px-4 pb-8 pt-6" role="log" aria-label="Conversa" aria-busy={running}>
          {loadingConv && <p className="text-sm text-muted">Carregando…</p>}
          {turns.map((t, ti) => {
            const text = t.items
              .filter((x): x is StoredMessage => 'role' in x)
              .map((x) => x.content)
              .join('\n\n');
            const isLast = ti === lastTurnIdx && !live;
            return (
              <div key={t.user.id} className="space-y-4">
                <UserBubble text={t.user.display ?? t.user.content} />
                {t.items.length > 0 && (
                  <div className="flex gap-3">
                    <div className="hidden shrink-0 pt-0.5 sm:block">
                      <LogoMark size={26} />
                    </div>
                    <div className="min-w-0 flex-1">
                      {t.items.map((x, i) =>
                        'role' in x ? (
                          <AssistantText key={x.id} id={`m-${x.id}`} text={x.content} />
                        ) : (
                          <ToolBlock
                            key={x.call.id + i}
                            tool={{
                              id: x.call.id,
                              name: x.call.name,
                              title: x.result?.toolDisplay?.title ?? '',
                              status: !x.result ? 'error' : x.result.isError ? 'error' : 'ok',
                              output: x.result?.content ?? 'Sem resultado (interrompido).',
                              summary: x.result?.toolDisplay?.summary,
                              diff: x.result?.toolDisplay?.diff,
                              artifact: x.result?.toolDisplay?.artifact,
                              input: prettyArgs(x.call.arguments),
                            }}
                          />
                        ),
                      )}
                      {isLast && lastTodos.length > 0 && <TodoBox todos={lastTodos} />}
                      <div className="mt-2 flex items-center gap-1">
                        {text.trim() && <CopyButton text={text} />}
                        {isLast && !running && (
                          <button
                            type="button"
                            onClick={() => void regenerate()}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg"
                          >
                            <RefreshCw size={14} aria-hidden /> Regenerar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {live && (
            <div className="space-y-4">
              {live.userText && <UserBubble text={live.userText} />}
              <div className="flex gap-3">
                <div className="hidden shrink-0 pt-0.5 sm:block">
                  <LogoMark size={26} />
                </div>
                <div className="min-w-0 flex-1">
                  {live.notices.map((n, i) => (
                    <p key={i} className="mb-2 text-xs text-muted">
                      ↻ {n}
                    </p>
                  ))}
                  <LiveParts parts={live.parts} />
                  <TodoBox todos={live.todos} />
                  {live.parts.length === 0 && (
                    <div className="flex items-center gap-2 py-1 text-sm text-muted" aria-label="Pensando">
                      <span className="h-2 w-2 animate-pulse2 rounded-full bg-lime" />
                      <span className="h-2 w-2 animate-pulse2 rounded-full bg-lime [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-pulse2 rounded-full bg-lime [animation-delay:300ms]" />
                      <span className="ml-1">Pensando…</span>
                    </div>
                  )}
                  {live.error && <ErrorBox message={live.error} />}
                </div>
              </div>
            </div>
          )}

          {!live && lastError && (
            <ErrorBox message={lastError} onRetry={() => void regenerate()} />
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[760px] px-4 pb-3">
        <Composer autoFocus />
        <p className="mt-2 text-center text-xs text-muted">A Nexora pode errar. Revise as sugestões antes de decidir.</p>
      </div>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { setSettings } = useStore();
  const isKey = /chave/i.test(message);
  const isLimit = /limite/i.test(message);
  return (
    <div role="alert" className="my-3 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm">
      <AlertTriangle size={16} className="text-red-500" aria-hidden />
      <span className="flex-1">
        {message}
        {isLimit && ' O limite é do plano gratuito da Groq; você pode trocar de modelo nas configurações.'}
      </span>
      {(isKey || isLimit) && (
        <button type="button" onClick={() => setSettings(true)} className="rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-elevated">
          Configurações
        </button>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-elevated">
          <RefreshCw size={12} aria-hidden />
          Tentar novamente
        </button>
      )}
    </div>
  );
}
