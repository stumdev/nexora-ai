import React, { useEffect } from 'react';
import { KeyRound, Menu, MessageSquarePlus } from 'lucide-react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { Welcome } from './components/Welcome';
import { ChatView } from './components/ChatView';
import { ArtifactPanel } from './components/ArtifactPanel';
import { Settings } from './components/Settings';
import { Wordmark } from './components/Logo';

export function App() {
  const { init, info, infoError, currentId, live, conversations, artifact, settingsOpen, setSettings, sidebarOpen, setSidebar, newChat, running, stop, announce } =
    useStore();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        newChat();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebar(!useStore.getState().sidebarOpen);
      } else if (e.key === 'Escape' && useStore.getState().running && !useStore.getState().settingsOpen) {
        stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newChat, setSidebar, stop]);

  const title = conversations.find((c) => c.id === currentId)?.title;
  const showChat = !!currentId || !!live;

  return (
    <div className="flex h-full overflow-hidden">
      <a href="#composer" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-lime focus:px-3 focus:py-2 focus:text-on-lime">
        Pular para o campo de mensagem
      </a>
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col" id="composer">
        <header className="flex h-12 shrink-0 items-center gap-2 px-3">
          {!sidebarOpen && (
            <button type="button" onClick={() => setSidebar(true)} aria-label="Abrir menu" className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-fg md:hidden">
              <Menu size={20} aria-hidden />
            </button>
          )}
          {!sidebarOpen && <Wordmark className="md:hidden" />}
          <p className="min-w-0 flex-1 truncate text-center text-sm text-muted md:text-left">{showChat ? title : ''}</p>
          {showChat && (
            <button type="button" onClick={newChat} aria-label="Nova conversa (Ctrl+Shift+O)" title="Nova conversa" className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-fg">
              <MessageSquarePlus size={18} aria-hidden />
            </button>
          )}
        </header>

        {infoError && (
          <div role="alert" className="mx-auto mb-2 w-full max-w-[760px] rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm">
            {infoError}
          </div>
        )}
        {info && !info.hasKey && (
          <div className="mx-auto mb-2 flex w-[calc(100%-2rem)] max-w-[760px] flex-wrap items-center gap-3 rounded-xl border border-lime/50 bg-lime/10 px-4 py-2.5 text-sm">
            <KeyRound size={16} className="text-lime-text" aria-hidden />
            <span className="flex-1">Para começar, configure sua chave gratuita da Groq.</span>
            <button type="button" onClick={() => setSettings(true)} className="rounded-lg bg-lime px-3 py-1 text-sm font-medium text-on-lime">
              Configurar
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1">
          {showChat ? (
            <ChatView />
          ) : (
            <div className="h-full overflow-y-auto">
              <Welcome />
            </div>
          )}
        </div>
      </main>
      {artifact && <ArtifactPanel artifact={artifact} />}
      {settingsOpen && <Settings />}
      <div className="sr-only" aria-live="polite" role="status">
        {running ? 'A Nexora está respondendo…' : announce}
      </div>
    </div>
  );
}
