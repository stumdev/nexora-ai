import React, { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import type { Artifact } from '@nexora/core/types';
import { useStore } from '../store';
import { CopyButton, Markdown } from './Markdown';

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'nexora'
  );
}

/** Converte o SVG do cartaz em PNG no navegador (canvas). */
async function svgToPng(svg: string, width = 1080, height = 1350): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Falha ao carregar o SVG'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar PNG'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ArtifactPanel({ artifact }: { artifact: Artifact }) {
  const openArtifact = useStore((s) => s.openArtifact);
  const [tab, setTab] = useState<'view' | 'code'>('view');
  const [width, setWidth] = useState(() => Math.round(Math.min(720, window.innerWidth * 0.45)));
  const dragging = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTab('view');
    closeRef.current?.focus();
  }, [artifact.id]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      setWidth(Math.max(320, Math.min(window.innerWidth - 420, window.innerWidth - e.clientX)));
    };
    const up = () => (dragging.current = false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  const name = slug(artifact.title);
  const onDownload = async () => {
    if (artifact.kind === 'svg') download(`${name}.png`, await svgToPng(artifact.content));
    else if (artifact.kind === 'html') download(`${name}.html`, new Blob([artifact.content], { type: 'text/html' }));
    else download(`${name}.md`, new Blob([artifact.content], { type: 'text/markdown' }));
  };

  return (
    <aside
      aria-label={`Artefato: ${artifact.title}`}
      className="fixed inset-0 z-40 flex flex-col bg-bg md:static md:z-auto md:shrink-0 md:border-l md:border-line"
      style={{ width: window.innerWidth >= 768 ? width : undefined }}
    >
      <div
        className="absolute inset-y-0 -left-1 hidden w-2 cursor-col-resize md:block"
        onPointerDown={() => (dragging.current = true)}
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar painel"
      />
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate font-serif text-[17px] font-medium">{artifact.title}</h2>
        <div role="tablist" aria-label="Modo de exibição" className="flex rounded-lg border border-line p-0.5 text-sm">
          {(['view', 'code'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2.5 py-1 ${tab === t ? 'bg-elevated font-medium' : 'text-muted hover:text-fg'}`}
            >
              {t === 'view' ? 'Visualizar' : 'Código'}
            </button>
          ))}
        </div>
        <CopyButton text={artifact.content} />
        <button type="button" onClick={() => void onDownload()} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg" title="Baixar">
          <Download size={14} aria-hidden />
          <span>{artifact.kind === 'svg' ? 'PNG' : 'Baixar'}</span>
        </button>
        {artifact.kind === 'svg' && (
          <button
            type="button"
            onClick={() => download(`${name}.svg`, new Blob([artifact.content], { type: 'image/svg+xml' }))}
            className="hidden rounded-lg px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg sm:inline"
          >
            SVG
          </button>
        )}
        <button ref={closeRef} type="button" onClick={() => openArtifact(null)} aria-label="Fechar painel" className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-fg">
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'code' ? (
          <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">{artifact.content}</pre>
        ) : artifact.kind === 'svg' ? (
          <div className="grid min-h-full place-items-center p-6">
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(artifact.content)}`}
              alt={`Cartaz: ${artifact.title}`}
              className="h-auto w-full max-w-[480px] rounded-xl shadow-2xl"
            />
          </div>
        ) : artifact.kind === 'html' ? (
          <iframe title={artifact.title} sandbox="" srcDoc={artifact.content} className="h-full w-full bg-white" />
        ) : (
          <div className="mx-auto max-w-[720px] px-6 py-6">
            <Markdown text={artifact.content} />
          </div>
        )}
        {artifact.files && artifact.files.length > 0 && tab === 'view' && (
          <p className="px-6 pb-6 text-center text-xs text-muted">Salvo em: {artifact.files.join(' · ')}</p>
        )}
      </div>
    </aside>
  );
}
