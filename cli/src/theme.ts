import chalk from 'chalk';

export const colors = {
  lime: '#B7F34A',
  limeDim: '#7FA834',
  text: '#F2F4F1',
  muted: '#A3AAA5',
  border: '#4A524D',
  red: '#F87171',
  green: '#86EFAC',
  diffAddBg: '#1E3A1E',
  diffDelBg: '#3A1E1E',
};

export const lime = chalk.hex(colors.lime);
export const muted = chalk.hex(colors.muted);

const LETTERS: Record<string, string[]> = {
  N: ['███╗   ██╗', '████╗  ██║', '██╔██╗ ██║', '██║╚██╗██║', '██║ ╚████║', '╚═╝  ╚═══╝'],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  X: ['██╗  ██╗', '╚██╗██╔╝', ' ╚███╔╝ ', ' ██╔██╗ ', '██╔╝ ██╗', '╚═╝  ╚═╝'],
  O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
};

/** Logo ASCII "NEXORA" (fonte ANSI Shadow), montado letra a letra. */
export function asciiLogo(word = 'NEXORA'): string[] {
  const rows = ['', '', '', '', '', ''];
  for (const ch of word) {
    const l = LETTERS[ch];
    if (!l) continue;
    l.forEach((line, i) => (rows[i] += line));
  }
  return rows;
}
