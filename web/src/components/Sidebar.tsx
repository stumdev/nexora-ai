import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, MessageSquarePlus, MoreHorizontal, PanelLeftClose, PanelLeft, Pencil, Search, Settings, Trash2 } from 'lucide-react';
import type { Conversation } from '@nexora/core/types';
import { useStore } from '../store';
import { api } from '../api';
import { LogoMark, Wordmark } from './Logo';

function groupOf(ts: number): 'Hoje' | 'Ontem' | 'Anteriores' {
  const d = new Date(ts);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= start) return 'Hoje';
  if (d.getTime() >= start - 86_400_000) return 'Ontem';
  return 'Anteriores';
}

function ConvItem({ conv, active }: { conv: Conversation; active: boolean }) {
  const { openConversation, rename, remove } = useStore();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conv.title);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  if (editing) {
    return (
      <form
        className="px-1"
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          if (title.trim() && title !== conv.title) void rename(conv.id, title.trim());
        }}
      >
        <input
          autoFocus
          aria-label="Novo nome da conversa"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          className="w-full rounded-lg border border-lime/60 bg-surface px-2 py-1.5 text-sm outline-none"
        />
      </form>
    );
  }

  return (
    <div ref={ref} className={`group relative flex items-center rounded-lg ${active ? 'bg-elevated' : 'hover:bg-elevated/60'}`}>
      <button
        type="button"
        onClick={() => void openConversation(conv.id)}
        className="min-w-0 flex-1 truncate px-2.5 py-1.5 text-left text-sm"
        aria-current={active ? 'page' : undefined}
        title={conv.title}
      >
        {conv.title}
      </button>
      <button
        type="button"
        aria-label={`Opções da conversa ${conv.title}`}
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((m) => !m)}
        className={`mr-1 rounded-md p-1 text-muted hover:text-fg ${menu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {menu && (
        <div role="menu" className="absolute right-1 top-8 z-30 w-44 animate-fadein rounded-xl border border-line bg-surface p-1 shadow-xl">
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-elevated"
            onClick={() => {
              setMenu(false);
              setTitle(conv.title);
              setEditing(true);
            }}
          >
            <Pencil size={14} aria-hidden /> Renomear
          </button>
          <a role="menuitem" href={api.exportUrl(conv.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-elevated" onClick={() => setMenu(false)}>
            <Download size={14} aria-hidden /> Exportar (.md)
          </a>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-red-500 hover:bg-elevated"
            onClick={() => {
              setMenu(false);
              if (confirm(`Excluir a conversa "${conv.title}"?`)) void remove(conv.id);
            }}
          >
            <Trash2 size={14} aria-hidden /> Excluir
          </button>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { conversations, currentId, newChat, sidebarOpen, setSidebar, setSettings } = useStore();
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const filtered = q.trim() ? conversations.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase())) : conversations;
    const out: Record<string, Conversation[]> = { Hoje: [], Ontem: [], Anteriores: [] };
    for (const c of filtered) out[groupOf(c.updatedAt)].push(c);
    return out;
  }, [conversations, q]);

  if (!sidebarOpen) {
    return (
      <nav aria-label="Barra lateral" className="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-3 md:flex">
        <button type="button" onClick={() => setSidebar(true)} aria-label="Abrir barra lateral (Ctrl+B)" className="rounded-lg p-2 text-muted hover:bg-elevated hover:text-fg">
          <PanelLeft size={18} aria-hidden />
        </button>
        <button type="button" onClick={newChat} aria-label="Nova conversa" className="rounded-lg p-2 text-muted hover:bg-elevated hover:text-fg">
          <MessageSquarePlus size={18} aria-hidden />
        </button>
        <div className="flex-1" />
        <button type="button" onClick={() => setSettings(true)} aria-label="Configurações" className="rounded-lg p-2 text-muted hover:bg-elevated hover:text-fg">
          <Settings size={18} aria-hidden />
        </button>
        <LogoMark size={26} />
      </nav>
    );
  }

  const total = Object.values(groups).reduce((n, g) => n + g.length, 0);

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebar(false)} aria-hidden />
      <nav
        aria-label="Barra lateral"
        className="fixed inset-y-0 left-0 z-40 flex w-[272px] shrink-0 animate-fadein flex-col border-r border-line bg-surface md:static md:z-auto"
      >
        <div className="flex items-center justify-between px-3 pb-2 pt-3">
          <Wordmark />
          <button type="button" onClick={() => setSidebar(false)} aria-label="Fechar barra lateral (Ctrl+B)" className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-fg">
            <PanelLeftClose size={18} aria-hidden />
          </button>
        </div>
        <div className="px-2">
          <button
            type="button"
            onClick={newChat}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium hover:bg-elevated"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-lime text-on-lime">
              <MessageSquarePlus size={14} aria-hidden />
            </span>
            Nova conversa
          </button>
          <label className="mt-1 flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm text-muted focus-within:bg-elevated hover:bg-elevated/60">
            <Search size={16} aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar conversas"
              aria-label="Buscar conversas"
              className="w-full bg-transparent text-fg outline-none placeholder:text-muted"
            />
          </label>
        </div>
        <div className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
          {total === 0 && <p className="px-3 py-4 text-sm text-muted">{q ? 'Nada encontrado.' : 'Suas conversas aparecem aqui.'}</p>}
          {(['Hoje', 'Ontem', 'Anteriores'] as const).map((g) =>
            groups[g].length ? (
              <section key={g} className="mb-3" aria-label={g}>
                <h2 className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted">{g}</h2>
                {groups[g].map((c) => (
                  <ConvItem key={c.id} conv={c} active={c.id === currentId} />
                ))}
              </section>
            ) : null,
          )}
        </div>
        <div className="border-t border-line p-2">
          <button type="button" onClick={() => setSettings(true)} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm hover:bg-elevated">
            <Settings size={16} aria-hidden /> Configurações
          </button>
        </div>
      </nav>
    </>
  );
}
