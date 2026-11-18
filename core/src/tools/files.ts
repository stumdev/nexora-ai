import fs from 'node:fs/promises';
import path from 'node:path';
import { createTwoFilesPatch } from 'diff';
import type { Tool } from './types';
import { requireString } from './types';

export function resolvePath(cwd: string, p: string): string {
  return path.resolve(cwd, p);
}

export function displayPath(cwd: string, abs: string): string {
  const rel = path.relative(cwd, abs);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : abs;
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/** Diff unificado sem o cabeçalho "Index/===". */
export function makeDiff(name: string, before: string, after: string): string {
  const patch = createTwoFilesPatch(name, name, before, after, '', '', { context: 3 });
  return patch
    .split('\n')
    .filter((l) => !l.startsWith('===') && !l.startsWith('Index:') && !l.startsWith('\\ No newline'))
    .join('\n')
    .trim();
}

export function diffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    else if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }
  return { added, removed };
}

interface ReadInput {
  path: string;
  offset?: number;
  limit?: number;
}

export const ReadTool: Tool<ReadInput> = {
  name: 'Read',
  description:
    'Lê um arquivo de texto do disco e devolve o conteúdo com números de linha. Use antes de editar um arquivo. ' +
    'Caminhos relativos são resolvidos a partir da pasta atual.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho do arquivo' },
      offset: { type: 'number', description: 'Linha inicial (1 = primeira). Opcional.' },
      limit: { type: 'number', description: 'Quantidade máxima de linhas. Opcional (padrão 2000).' },
    },
    required: ['path'],
  },
  title: (i) => i.path,
  async run(input, ctx) {
    const file = resolvePath(ctx.cwd, requireString(input as any, 'path'));
    let text: string;
    try {
      const stat = await fs.stat(file);
      if (stat.isDirectory()) return { output: `"${input.path}" é uma pasta, não um arquivo. Use Glob para listar.`, isError: true };
      if (stat.size > 5 * 1024 * 1024) return { output: 'Arquivo grande demais (>5 MB).', isError: true };
      text = await fs.readFile(file, 'utf8');
    } catch {
      return { output: `Arquivo não encontrado: ${input.path}`, isError: true };
    }
    const lines = text.split(/\r?\n/);
    const start = Math.max(1, Math.floor(input.offset ?? 1));
    const limit = Math.max(1, Math.floor(input.limit ?? 2000));
    const slice = lines.slice(start - 1, start - 1 + limit);
    const width = String(start + slice.length).length;
    const out = slice.map((l, i) => `${String(start + i).padStart(width)}\t${l.length > 2000 ? l.slice(0, 2000) + '…' : l}`);
    const more = start - 1 + slice.length < lines.length ? `\n… (${lines.length - (start - 1 + slice.length)} linhas a mais)` : '';
    return {
      output: (out.join('\n') || '(arquivo vazio)') + more,
      display: { summary: `Leu ${slice.length} linha${slice.length === 1 ? '' : 's'}` },
    };
  },
};

interface WriteInput {
  path: string;
  content: string;
}

export const WriteTool: Tool<WriteInput> = {
  name: 'Write',
  description:
    'Cria ou sobrescreve um arquivo com o conteúdo informado. Cria as pastas necessárias. ' +
    'Para mudar só um trecho de um arquivo existente, prefira Edit.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho do arquivo' },
      content: { type: 'string', description: 'Conteúdo completo do arquivo' },
    },
    required: ['path', 'content'],
  },
  needsPermission: true,
  title: (i) => i.path,
  async preview(input, ctx) {
    const file = resolvePath(ctx.cwd, input.path);
    const before = (await readIfExists(file)) ?? '';
    return {
      title: `${before ? 'Sobrescrever' : 'Criar'} ${displayPath(ctx.cwd, file)}`,
      diff: makeDiff(displayPath(ctx.cwd, file), before, input.content ?? ''),
    };
  },
  async run(input, ctx) {
    const rel = requireString(input as any, 'path');
    if (typeof input.content !== 'string') return { output: 'Parâmetro "content" ausente.', isError: true };
    const file = resolvePath(ctx.cwd, rel);
    const before = await readIfExists(file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, input.content, 'utf8');
    const diff = makeDiff(displayPath(ctx.cwd, file), before ?? '', input.content);
    const lines = input.content.split('\n').length;
    return {
      output: `${before === null ? 'Arquivo criado' : 'Arquivo sobrescrito'}: ${displayPath(ctx.cwd, file)} (${lines} linhas)`,
      display: { summary: `${before === null ? 'Criou' : 'Sobrescreveu'} ${displayPath(ctx.cwd, file)} (${lines} linhas)`, diff },
    };
  },
};

interface EditInput {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

/** Aplica a substituição exata. Lança erro com mensagem clara se ausente/ambígua. */
export function applyEdit(text: string, oldStr: string, newStr: string, replaceAll = false): string {
  if (oldStr === newStr) throw new Error('old_string e new_string são iguais; nada a mudar.');
  if (!oldStr) throw new Error('old_string não pode ser vazio. Para criar arquivo use Write.');
  const count = text.split(oldStr).length - 1;
  if (count === 0) throw new Error('Texto old_string não encontrado no arquivo. Leia o arquivo (Read) e copie o trecho exato.');
  if (count > 1 && !replaceAll) {
    throw new Error(`old_string aparece ${count} vezes. Inclua mais contexto para torná-lo único ou use replace_all: true.`);
  }
  return replaceAll ? text.split(oldStr).join(newStr) : text.replace(oldStr, () => newStr);
}

export const EditTool: Tool<EditInput> = {
  name: 'Edit',
  description:
    'Edita um arquivo substituindo um trecho exato (old_string) por outro (new_string). ' +
    'Leia o arquivo antes. old_string deve ser único no arquivo, a menos que replace_all seja true.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho do arquivo' },
      old_string: { type: 'string', description: 'Trecho exato a substituir' },
      new_string: { type: 'string', description: 'Novo trecho' },
      replace_all: { type: 'boolean', description: 'Substituir todas as ocorrências' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  needsPermission: true,
  title: (i) => i.path,
  async preview(input, ctx) {
    const file = resolvePath(ctx.cwd, input.path);
    const before = (await readIfExists(file)) ?? '';
    let after = before;
    try {
      after = applyEdit(before, input.old_string, input.new_string, input.replace_all);
    } catch {
      /* o erro aparece na execução */
    }
    return { title: `Editar ${displayPath(ctx.cwd, file)}`, diff: makeDiff(displayPath(ctx.cwd, file), before, after) };
  },
  async run(input, ctx) {
    const file = resolvePath(ctx.cwd, requireString(input as any, 'path'));
    const before = await readIfExists(file);
    if (before === null) return { output: `Arquivo não encontrado: ${input.path}`, isError: true };
    let after: string;
    try {
      after = applyEdit(before, input.old_string ?? '', input.new_string ?? '', input.replace_all);
    } catch (err) {
      return { output: (err as Error).message, isError: true };
    }
    await fs.writeFile(file, after, 'utf8');
    const diff = makeDiff(displayPath(ctx.cwd, file), before, after);
    const { added, removed } = diffStats(diff);
    return {
      output: `Arquivo editado: ${displayPath(ctx.cwd, file)}`,
      display: { summary: `+${added} -${removed} linhas`, diff },
    };
  },
};
