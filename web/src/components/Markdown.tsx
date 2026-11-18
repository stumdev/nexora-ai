import React, { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function CopyButton({ text, label = 'Copiar', className = '' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg transition-colors ${className}`}
      aria-label={done ? 'Copiado' : label}
      title={label}
    >
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span>{done ? 'Copiado' : label}</span>
    </button>
  );
}

function nodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (React.isValidElement(node)) return nodeText((node.props as { children?: React.ReactNode }).children);
  return '';
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const child = React.Children.toArray(children)[0];
  const className = React.isValidElement(child) ? ((child.props as { className?: string }).className ?? '') : '';
  const lang = /language-([\w-]+)/.exec(className)?.[1];
  const raw = nodeText(children).replace(/\n$/, '');
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-1">
        <span className="font-mono text-xs text-muted">{lang ?? 'texto'}</span>
        <CopyButton text={raw} />
      </div>
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className={`prose-nx ${streaming ? 'cursor-blink' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          code: ({ className, children }) => <code className={`${className ?? ''} font-mono`}>{children}</code>,
          table: ({ children }) => (
            <div className="table-wrap">
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
