import fs from 'node:fs/promises';
import path from 'node:path';

export interface PosterInput {
  marca?: string;
  chamada: string;
  slogan?: string;
  beneficios?: string[];
  convite?: string;
  rodape?: string;
  /** Nome base dos arquivos (sem extensão). */
  arquivo?: string;
}

export const POSTER_COLORS = {
  bg: '#111312',
  surface: '#181B19',
  elevated: '#202422',
  border: '#2B302D',
  text: '#F2F4F1',
  muted: '#A3AAA5',
  lime: '#B7F34A',
  onLime: '#0E1A00',
};

const W = 1080;
const H = 1350;
const FONT = "Inter, 'Segoe UI', Arial, Helvetica, sans-serif";

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/** Quebra texto em linhas por largura aproximada (fonte sans ≈ 0,55 × tamanho por caractere). */
export function wrapText(text: string, fontSize: number, maxWidth: number, maxLines = 4): string[] {
  const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * 0.56)));
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[.,;:!?]?$/, '…');
    return kept;
  }
  return lines;
}

function illustration(x: number, y: number): string {
  const c = POSTER_COLORS;
  // Ilustração editorial em traço: lojinha com toldo, notebook com gráfico e caderno de planejamento.
  return `
  <g transform="translate(${x} ${y})" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <!-- lojinha -->
    <g stroke="${c.text}" stroke-width="4">
      <rect x="0" y="70" width="230" height="170" rx="10"/>
      <path d="M-10 70 L20 20 H210 L240 70 Z" fill="${c.elevated}"/>
      <path d="M20 20 L35 70 M65 20 L72 70 M115 20 L115 70 M165 20 L158 70 M210 20 L195 70"/>
      <rect x="25" y="120" width="80" height="120" rx="6"/>
      <circle cx="92" cy="182" r="4" fill="${c.text}"/>
      <rect x="125" y="115" width="80" height="60" rx="6"/>
    </g>
    <path d="M-10 70 Q 10 92 32 70 Q 52 92 72 70 Q 94 92 115 70 Q 136 92 158 70 Q 178 92 198 70 Q 220 92 240 70" stroke="${c.lime}" stroke-width="5"/>
    <!-- notebook -->
    <g transform="translate(270 110)">
      <rect x="20" y="0" width="200" height="125" rx="10" stroke="${c.text}" stroke-width="4" fill="${c.surface}"/>
      <path d="M0 140 H240 L225 125 H15 Z" stroke="${c.text}" stroke-width="4" fill="${c.elevated}"/>
      <path d="M45 100 L85 75 L120 88 L165 45 L195 30" stroke="${c.lime}" stroke-width="6"/>
      <path d="M180 28 L197 29 L193 46" stroke="${c.lime}" stroke-width="6"/>
      <path d="M45 105 H195" stroke="${c.border}" stroke-width="3"/>
    </g>
    <!-- caderno de planejamento -->
    <g transform="translate(540 85) rotate(6)">
      <rect x="0" y="0" width="150" height="190" rx="8" stroke="${c.text}" stroke-width="4" fill="${c.surface}"/>
      <path d="M0 0 V190" stroke="${c.lime}" stroke-width="8"/>
      <path d="M30 45 H125 M30 80 H125 M30 115 H100" stroke="${c.muted}" stroke-width="4"/>
      <path d="M30 150 l12 12 l26 -28" stroke="${c.lime}" stroke-width="6"/>
    </g>
  </g>`;
}

/** Monta o SVG do cartaz vertical 4:5 (1080 × 1350), grafite + branco + verde-lima. */
export function buildPosterSvg(input: PosterInput): string {
  const c = POSTER_COLORS;
  const marca = (input.marca || 'NEXORA AI').toUpperCase();
  const pad = 90;
  const parts: string[] = [];

  // topo: marca
  parts.push(`
  <g transform="translate(${pad} 96)">
    <rect width="56" height="56" rx="14" fill="${c.lime}"/>
    ${
      /^NEXORA/.test(marca)
        ? `<path d="M15 41 V15 L41 41 V15" stroke="${c.onLime}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<text x="28" y="39" text-anchor="middle" font-family="${FONT}" font-size="32" font-weight="800" fill="${c.onLime}">${escapeXml(marca.charAt(0))}</text>`
    }
    <text x="76" y="39" font-family="${FONT}" font-size="30" font-weight="700" letter-spacing="4" fill="${c.text}">${escapeXml(marca)}</text>
  </g>`);

  // chamada
  const headLines = wrapText(input.chamada, 92, W - pad * 2, 3);
  let y = 300;
  headLines.forEach((line, i) => {
    parts.push(
      `<text x="${pad}" y="${y + i * 104}" font-family="${FONT}" font-size="92" font-weight="800" fill="${i === headLines.length - 1 ? c.lime : c.text}">${escapeXml(line)}</text>`,
    );
  });
  y += headLines.length * 104;

  if (input.slogan) {
    const sl = wrapText(input.slogan, 38, W - pad * 2, 2);
    sl.forEach((line, i) => {
      parts.push(`<text x="${pad}" y="${y + 10 + i * 50}" font-family="${FONT}" font-size="38" fill="${c.muted}">${escapeXml(line)}</text>`);
    });
    y += 10 + sl.length * 50;
  }

  // benefícios
  const beneficios = (input.beneficios ?? []).slice(0, 3);
  y += 50;
  beneficios.forEach((b) => {
    const lines = wrapText(b, 36, W - pad * 2 - 70, 2);
    parts.push(`
    <g transform="translate(${pad} ${y})">
      <circle cx="20" cy="-12" r="20" fill="${c.lime}"/>
      <path d="M11 -12 l6 6 l12 -13" stroke="${c.onLime}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      ${lines.map((l, i) => `<text x="62" y="${i * 46}" font-family="${FONT}" font-size="36" font-weight="500" fill="${c.text}">${escapeXml(l)}</text>`).join('')}
    </g>`);
    y += 34 + lines.length * 46;
  });

  // ilustração
  // ilustração só quando há espaço livre (textos longos ocupam a área)
  // (a ilustração ocupa ~290 px de altura e o botão começa em y = 1175)
  const illusY = Math.max(y + 10, 800);
  if (illusY <= 870) parts.push(illustration(pad + 30, illusY));

  // convite (botão)
  if (input.convite) {
    const label = wrapText(input.convite, 34, W - pad * 2 - 80, 1)[0];
    const bw = Math.min(W - pad * 2, label.length * 34 * 0.56 + 90);
    parts.push(`
    <g transform="translate(${pad} 1175)">
      <rect width="${bw}" height="76" rx="38" fill="${c.lime}"/>
      <text x="${bw / 2}" y="49" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="700" fill="${c.onLime}">${escapeXml(label)}</text>
    </g>`);
  }

  // rodapé discreto
  const rodape = input.rodape || 'Feito com Nexora AI';
  parts.push(
    `<text x="${pad}" y="${H - 50}" font-family="${FONT}" font-size="22" fill="${c.muted}">${escapeXml(rodape.slice(0, 90))}</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${c.bg}"/>
  <circle cx="${W - 60}" cy="140" r="260" fill="${c.lime}" opacity="0.06"/>
  <rect x="${pad}" y="200" width="120" height="8" rx="4" fill="${c.lime}"/>
  ${parts.join('\n')}
</svg>`;
}

export function posterHtml(svg: string, title: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0c0b}svg{max-width:min(100vw,540px);height:auto;box-shadow:0 20px 60px rgba(0,0,0,.5);border-radius:12px}</style>
</head><body>${svg}</body></html>`;
}

export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'cartaz'
  );
}

/** Converte SVG em PNG com resvg (módulo nativo opcional). */
export async function svgToPng(svg: string): Promise<Buffer | null> {
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    const r = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' }, fitTo: { mode: 'width', value: 1080 } });
    return Buffer.from(r.render().asPng());
  } catch {
    return null;
  }
}

export async function savePoster(input: PosterInput, cwd: string): Promise<{ svg: string; files: string[] }> {
  const svg = buildPosterSvg(input);
  const dir = path.join(cwd, 'nexora-docs');
  await fs.mkdir(dir, { recursive: true });
  const base = slugify(input.arquivo || `cartaz-${input.marca || input.chamada}`);
  const files: string[] = [];
  const svgPath = path.join(dir, `${base}.svg`);
  await fs.writeFile(svgPath, svg, 'utf8');
  files.push(svgPath);
  const htmlPath = path.join(dir, `${base}.html`);
  await fs.writeFile(htmlPath, posterHtml(svg, input.marca || 'Cartaz'), 'utf8');
  files.push(htmlPath);
  const png = await svgToPng(svg);
  if (png) {
    const pngPath = path.join(dir, `${base}.png`);
    await fs.writeFile(pngPath, png);
    files.push(pngPath);
  }
  return { svg, files };
}
