import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { Tool } from './types';
import { requireString } from './types';
import { resolvePath, displayPath } from './files';

const MAX_OUTPUT = 30_000;

export interface ShellInfo {
  file: string;
  args: (cmd: string) => string[];
  label: string;
}

let cachedShell: ShellInfo | null = null;

/** No Windows usa o Git Bash se existir; senão PowerShell. Em Linux/macOS usa bash/sh. */
export function detectShell(): ShellInfo {
  if (cachedShell) return cachedShell;
  if (process.platform === 'win32') {
    const candidates = [
      process.env.NEXORA_BASH,
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ].filter(Boolean) as string[];
    const bash = candidates.find((c) => fs.existsSync(c));
    cachedShell = bash
      ? { file: bash, args: (c) => ['-c', c], label: 'bash (Git Bash no Windows)' }
      : { file: 'powershell.exe', args: (c) => ['-NoProfile', '-NonInteractive', '-Command', c], label: 'PowerShell' };
  } else {
    const bash = fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
    cachedShell = { file: bash, args: (c) => ['-c', c], label: path.basename(bash) };
  }
  return cachedShell;
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGKILL');
  } catch {
    /* processo já terminou */
  }
}

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + `\n… (saída cortada, ${s.length - MAX_OUTPUT} caracteres a mais)` : s;
}

interface BashInput {
  command: string;
  timeout?: number;
}

export const BashTool: Tool<BashInput> = {
  name: 'Bash',
  description:
    'Executa um comando no terminal, na pasta atual, e devolve a saída (stdout+stderr). ' +
    'Use para rodar scripts, instalar dependências ou consultar o sistema. Evite comandos interativos. ' +
    'Timeout padrão de 120 s (máx. 600 s).',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Comando a executar' },
      timeout: { type: 'number', description: 'Timeout em milissegundos (opcional)' },
    },
    required: ['command'],
  },
  needsPermission: true,
  title: (i) => i.command,
  preview: (i) => ({ title: 'Executar comando', command: i.command }),
  run(input, ctx) {
    const command = requireString(input as any, 'command');
    const timeout = Math.min(Math.max(Number(input.timeout) || 120_000, 1000), 600_000);
    const shell = detectShell();
    return new Promise((resolve) => {
      const child = spawn(shell.file, shell.args(command), {
        cwd: ctx.cwd,
        env: process.env,
        detached: process.platform !== 'win32',
        windowsHide: true,
      });
      let out = '';
      let finished = false;
      const onData = (d: Buffer) => {
        if (out.length < MAX_OUTPUT * 2) out += d.toString('utf8');
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      const finish = (code: number | null, note?: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        ctx.signal.removeEventListener('abort', onAbort);
        const text = truncate(out.trim()) || '(sem saída)';
        const isError = note !== undefined || (code !== 0 && code !== null);
        resolve({
          output: `${text}${note ? `\n${note}` : ''}${code ? `\n(código de saída ${code})` : ''}`,
          isError,
          display: { summary: note ?? (code ? `Saiu com código ${code}` : `${text.split('\n').length} linha(s) de saída`) },
        });
      };
      const onAbort = () => {
        killTree(child.pid);
        finish(null, 'Comando interrompido pelo usuário.');
      };
      const timer = setTimeout(() => {
        killTree(child.pid);
        finish(null, `Comando excedeu o tempo limite (${timeout / 1000}s).`);
      }, timeout);
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      child.on('error', (err) => finish(null, `Falha ao iniciar o comando: ${err.message}`));
      child.on('close', (code) => finish(code));
    });
  },
};

const IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**'];

interface GlobInput {
  pattern: string;
  path?: string;
}

export const GlobTool: Tool<GlobInput> = {
  name: 'Glob',
  description: 'Lista arquivos que combinam com um padrão glob (ex.: "**/*.md", "src/**/*.ts"). Ignora node_modules e .git.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Padrão glob' },
      path: { type: 'string', description: 'Pasta base (opcional)' },
    },
    required: ['pattern'],
  },
  title: (i) => i.pattern,
  async run(input, ctx) {
    const pattern = requireString(input as any, 'pattern');
    const base = resolvePath(ctx.cwd, input.path ?? '.');
    const files = await fg(pattern, { cwd: base, ignore: IGNORE, dot: false, onlyFiles: true, suppressErrors: true });
    files.sort();
    const shown = files.slice(0, 300).map((f) => displayPath(ctx.cwd, path.join(base, f)).replace(/\\/g, '/'));
    return {
      output: shown.length ? shown.join('\n') + (files.length > 300 ? `\n… (+${files.length - 300})` : '') : 'Nenhum arquivo encontrado.',
      display: { summary: `${files.length} arquivo(s)` },
    };
  },
};

interface GrepInput {
  pattern: string;
  path?: string;
  glob?: string;
  ignore_case?: boolean;
}

function hasRipgrep(): boolean {
  try {
    return spawnSync('rg', ['--version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}
let rgAvailable: boolean | null = null;

export const GrepTool: Tool<GrepInput> = {
  name: 'Grep',
  description:
    'Procura um texto ou expressão regular dentro dos arquivos e devolve "arquivo:linha: conteúdo". ' +
    'Use glob para filtrar (ex.: "*.md").',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Expressão regular' },
      path: { type: 'string', description: 'Pasta ou arquivo (opcional)' },
      glob: { type: 'string', description: 'Filtro de arquivos, ex.: "*.csv" (opcional)' },
      ignore_case: { type: 'boolean', description: 'Ignorar maiúsculas/minúsculas' },
    },
    required: ['pattern'],
  },
  title: (i) => i.pattern,
  async run(input, ctx) {
    const pattern = requireString(input as any, 'pattern');
    const base = resolvePath(ctx.cwd, input.path ?? '.');
    if (rgAvailable === null) rgAvailable = hasRipgrep();
    let lines: string[] = [];
    if (rgAvailable) {
      const args = ['-n', '--no-heading', '--color', 'never', '-M', '300'];
      if (input.ignore_case) args.push('-i');
      if (input.glob) args.push('-g', input.glob);
      args.push('--', pattern, base);
      const r = spawnSync('rg', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      lines = (r.stdout || '').split('\n').filter(Boolean);
    } else {
      let re: RegExp;
      try {
        re = new RegExp(pattern, input.ignore_case ? 'i' : '');
      } catch {
        return { output: 'Expressão regular inválida.', isError: true };
      }
      const isFile = fs.existsSync(base) && fs.statSync(base).isFile();
      const files = isFile
        ? [base]
        : (await fg(input.glob ? `**/${input.glob}` : '**/*', { cwd: base, ignore: IGNORE, absolute: true, suppressErrors: true }));
      for (const f of files) {
        let text: string;
        try {
          if (fs.statSync(f).size > 2 * 1024 * 1024) continue;
          text = fs.readFileSync(f, 'utf8');
        } catch {
          continue;
        }
        text.split(/\r?\n/).forEach((l, i) => {
          if (re.test(l)) lines.push(`${f}:${i + 1}:${l.slice(0, 300)}`);
        });
        if (lines.length > 500) break;
      }
    }
    const rel = lines.slice(0, 200).map((l) => {
      const m = /^(.*?):(\d+):(.*)$/.exec(l.startsWith(base) || /^[A-Za-z]:/.test(l) ? l.replace(/^([A-Za-z]):/, '$1\u0000') : l);
      if (!m) return l;
      return `${displayPath(ctx.cwd, m[1].replace('\u0000', ':')).replace(/\\/g, '/')}:${m[2]}:${m[3]}`;
    });
    return {
      output: rel.length ? rel.join('\n') + (lines.length > 200 ? `\n… (+${lines.length - 200} resultados)` : '') : 'Nenhuma ocorrência.',
      display: { summary: `${lines.length} ocorrência(s)` },
    };
  },
};
