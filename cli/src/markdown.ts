import chalk from 'chalk';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { colors } from './theme';

function unescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

let cached:{ width: number; marked: Marked } | null = null;

function instance(width: number): Marked {
  if (cached && cached.width === width) return cached.marked;
  const lime = chalk.hex(colors.lime);
  const m = new Marked(
    markedTerminal({
      width,
      reflowText: true,
      tab: 2,
      showSectionPrefix: false,
      firstHeading: lime.bold,
      heading: lime.bold,
      strong: chalk.bold,
      em: chalk.italic,
      codespan: chalk.hex('#D9F99D'),
      code: chalk.hex('#E5E7EB'),
      blockquote: chalk.hex(colors.muted).italic,
      link: lime.underline,
      href: lime.underline,
      hr: chalk.hex(colors.border),
      listitem: chalk.reset,
      table: chalk.reset,
      paragraph: chalk.reset,
      emoji: false,
    }) as any,
  );
  // Correção: o marked-terminal não renderiza negrito/código dentro de itens de lista.
  m.use({
    renderer: {
      text(this: any, token: any) {
        if (typeof token === 'object' && token.tokens) return this.parser.parseInline(token.tokens);
        return unescape(typeof token === 'string' ? token : token.text);
      },
    },
  });
  cached = { width, marked: m };
  return m;
}

/** Renderiza Markdown para o terminal (títulos, listas, tabelas, código com cores). */
export function renderMarkdown(text: string, width = process.stdout.columns || 80): string {
  if (!text.trim()) return '';
  if (process.env.NO_COLOR) return text.trim();
  try {
    const out = instance(Math.max(40, Math.min(width - 4, 120))).parse(text) as string;
    return out.replace(/\n{3,}/g, '\n\n').trimEnd();
  } catch {
    return text;
  }
}
