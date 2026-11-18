import React from 'react';

/** Símbolo da Nexora: um "N" cujo último traço vira uma seta de crescimento verde-lima. */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" className="fill-surface" stroke="rgb(var(--border))" strokeWidth="2" />
      <path d="M17 46 V18 L41 42" fill="none" stroke="rgb(var(--text))" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M41 42 L47 18" fill="none" stroke="rgb(var(--lime))" strokeWidth="6" strokeLinecap="round" />
      <path d="M39.5 24.6 L47 18 L50.6 27.3" fill="none" stroke="rgb(var(--lime))" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={26} />
      <span className="text-[15px] font-bold tracking-[0.18em]">
        NEXORA <span className="text-lime-text">AI</span>
      </span>
    </span>
  );
}
