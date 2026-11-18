import React from 'react';
import { BarChart3, Lightbulb, Megaphone, NotebookPen, Sparkles, Tag, Utensils } from 'lucide-react';
import { useStore } from '../store';
import { Composer } from './Composer';
import { LogoMark } from './Logo';

const CHIPS = [
  { label: 'Criar plano de negócio', icon: NotebookPen, fill: '/plano ' },
  { label: 'Ideias de negócio', icon: Lightbulb, fill: '/ideia ' },
  { label: 'Nomes e slogans', icon: Tag, fill: '/nomes ' },
  { label: 'Estratégia de marketing', icon: Megaphone, fill: '/marketing ' },
  { label: 'Calcular ponto de equilíbrio', icon: BarChart3, fill: '/financeiro ' },
  { label: 'Criar cartaz', icon: Sparkles, fill: '/cartaz ' },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function Welcome() {
  const { info, send } = useStore();
  const name = info?.userName;
  const fill = (text: string) => window.dispatchEvent(new CustomEvent('nexora:fill', { detail: text }));

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center animate-fadein">
        <div className="mb-5 flex justify-center">
          <LogoMark size={44} />
        </div>
        <p className="font-serif text-2xl text-muted sm:text-[28px]">
          {greeting()}
          {name ? `, ${name}` : ''}.
        </p>
        <h1 className="mt-1 font-serif text-[34px] font-medium leading-tight tracking-tight sm:text-[44px]">Qual é a sua ideia hoje?</h1>
      </div>

      <Composer autoFocus large />

      <div className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Sugestões">
        {CHIPS.map(({ label, icon: Icon, fill: f }) => (
          <button
            key={label}
            type="button"
            onClick={() => fill(f)}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-fg/90 transition-colors hover:border-muted/50 hover:bg-elevated"
          >
            <Icon size={15} aria-hidden className="text-lime-text" />
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void send('/demo')}
          className="inline-flex items-center gap-2 rounded-full border border-lime/50 bg-lime/10 px-3.5 py-2 text-sm font-medium text-lime-text transition-colors hover:bg-lime/20"
        >
          <Utensils size={15} aria-hidden />
          Experimentar o Urban Burger
        </button>
      </div>

      <ol className="mx-auto mt-10 grid max-w-[640px] gap-3 text-sm text-muted sm:grid-cols-3" aria-label="Como funciona">
        {['Você explica a ideia ou o problema', 'A Nexora analisa e sugere', 'Você revisa e decide'].map((t, i) => (
          <li key={t} className="flex items-start gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-xs font-semibold text-lime-text">{i + 1}</span>
            <span className="pt-0.5">{t}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
