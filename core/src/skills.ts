import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillInfo } from './types';

export interface Skill extends SkillInfo {
  body: string;
  file: string;
}

/** Procura uma pasta subindo a partir deste arquivo (funciona no código-fonte e no bundle). */
export function findUp(name: string, check?: (dir: string) => boolean, start?: string): string | undefined {
  let dir = start ?? path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate) && (!check || check(candidate))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function skillsDir(): string | undefined {
  return process.env.NEXORA_SKILLS_DIR || findUp('skills', (d) => fs.existsSync(path.join(d, 'plano.md')));
}

/** Lê frontmatter simples (chave: valor) + corpo. */
export function parseSkill(raw: string, file: string): Skill {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const meta: Record<string, string> = {};
  let body = text;
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line.trim());
      if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
    }
    body = m[2];
  }
  const name = meta.name || path.basename(file, '.md');
  return { name, description: meta.description || '', argumentHint: meta['argument-hint'] || undefined, body: body.trim(), file };
}

/** Skills da pasta `skills/` do projeto + comandos do usuário em ./.nexora/commands. */
export function loadSkills(cwd = process.cwd()): Skill[] {
  const dirs = [skillsDir(), path.join(cwd, '.nexora', 'commands')].filter((d): d is string => !!d && fs.existsSync(d));
  const map = new Map<string, Skill>();
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      try {
        const s = parseSkill(fs.readFileSync(path.join(dir, f), 'utf8'), path.join(dir, f));
        map.set(s.name, s);
      } catch {
        /* ignora arquivos inválidos */
      }
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Substitui $ARGUMENTS no corpo da skill. */
export function expandSkill(skill: Skill, args: string): string {
  const a = args.trim();
  if (skill.body.includes('$ARGUMENTS')) return skill.body.replace(/\$ARGUMENTS/g, a || '(não informado — use o contexto da conversa ou pergunte o essencial)');
  return a ? `${skill.body}\n\nDetalhes do usuário: ${a}` : skill.body;
}

/** Se o texto começa com /skill, devolve o prompt expandido. */
export function resolveSkillInput(text: string, skills: Skill[]): { prompt: string; skill?: Skill } {
  const m = /^\/([\w-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return { prompt: text };
  const skill = skills.find((s) => s.name === m[1]);
  if (!skill) return { prompt: text };
  return { prompt: expandSkill(skill, m[2] ?? ''), skill };
}
