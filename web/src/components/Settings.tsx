import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Moon, Sun, X } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { Wordmark } from './Logo';

export function Settings() {
  const { info, setSettings, refreshInfo, theme, setTheme } = useStore();
  const [key, setKey] = useState('');
  const [model, setModel] = useState(info?.model ?? '');
  const [name, setName] = useState(info?.userName ?? '');
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('input, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettings(false);
      if (e.key === 'Tab' && dialog.current) {
        const els = [...dialog.current.querySelectorAll<HTMLElement>('button, input, select, a[href]')].filter((el) => !el.hasAttribute('disabled'));
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [setSettings]);

  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      setStatus(await api.testKey(key.trim() || undefined));
    } catch (err) {
      setStatus({ ok: false, message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const patch: Record<string, string> = { model: model.trim(), userName: name.trim() };
      if (key.trim()) patch.apiKey = key.trim();
      await api.saveConfig(patch);
      await refreshInfo();
      setKey('');
      setStatus({ ok: true, message: 'Configurações salvas.' });
    } catch (err) {
      setStatus({ ok: false, message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && setSettings(false)}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="settings-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl animate-fadein">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="settings-title" className="font-serif text-xl font-medium">
            Configurações
          </h2>
          <button type="button" onClick={() => setSettings(false)} aria-label="Fechar" className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-fg">
            <X size={18} aria-hidden />
          </button>
        </div>

        <section className="space-y-4">
          <div>
            <label htmlFor="api-key" className="mb-1 block text-sm font-medium">
              Chave da API da Groq
            </label>
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={info?.hasKey ? `Salva: ${info.maskedKey}` : 'gsk_...'}
              className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-lime/70"
            />
            <p className="mt-1.5 text-xs text-muted">
              Grátis em{' '}
              <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-lime-text underline">
                console.groq.com/keys <ExternalLink size={11} aria-hidden />
              </a>
              . Fica só neste computador (~/.nexora/config.json).
              {info?.keyFromEnv && ' A variável GROQ_API_KEY está definida e tem prioridade.'}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => void test()} disabled={busy} className="rounded-xl border border-line px-3 py-1.5 text-sm hover:bg-elevated disabled:opacity-50">
                Testar conexão
              </button>
              {status && (
                <span role="status" className={`text-xs ${status.ok ? 'text-lime-text' : 'text-red-500'}`}>
                  {status.message}
                </span>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="model" className="mb-1 block text-sm font-medium">
              Modelo
            </label>
            <input
              id="model"
              list="model-list"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-lime/70"
            />
            <datalist id="model-list">
              {info?.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <p className="mt-1.5 text-xs text-muted">Se o limite gratuito acabar (erro 429), a Nexora tenta o próximo modelo da lista automaticamente.</p>
          </div>

          <div>
            <label htmlFor="uname" className="mb-1 block text-sm font-medium">
              Seu nome (para a saudação)
            </label>
            <input
              id="uname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-lime/70"
            />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Tema</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Tema">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={theme === t}
                  onClick={() => setTheme(t)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${theme === t ? 'border-lime/70 bg-lime/10' : 'border-line hover:bg-elevated'}`}
                >
                  {t === 'dark' ? <Moon size={14} aria-hidden /> : <Sun size={14} aria-hidden />}
                  {t === 'dark' ? 'Escuro' : 'Claro'}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setSettings(false)} className="rounded-xl border border-line px-4 py-2 text-sm hover:bg-elevated">
            Fechar
          </button>
          <button type="button" onClick={() => void save()} disabled={busy} className="rounded-xl bg-lime px-4 py-2 text-sm font-medium text-on-lime hover:opacity-90 disabled:opacity-50">
            Salvar
          </button>
        </div>

        <footer className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-muted">
          <Wordmark className="mb-2 text-fg" />
          <p>
            “Da ideia ao negócio, com inteligência.” Criado pela Nexora Technologies. A Nexora AI não substitui
            profissionais, pode errar e não promete resultados: a decisão final é sempre do empreendedor. Seus dados ficam neste computador.
          </p>
          <p className="mt-1">Versão {info?.version} · pasta: {info?.cwd}</p>
        </footer>
      </div>
    </div>
  );
}
