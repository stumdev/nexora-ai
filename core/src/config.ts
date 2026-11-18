import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Modelos gratuitos da Groq com tool calling, em ordem de preferência.
 * A lista muda com frequência: edite `models` em ~/.nexora/config.json.
 * Em caso de erro 429 (limite) ou modelo indisponível, o agente tenta o próximo.
 */
export const DEFAULT_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const GROQ_KEYS_URL = 'https://console.groq.com/keys';

export interface NexoraConfig {
  apiKey?: string;
  /** Modelo preferido (vai para o início da lista de fallback). */
  model?: string;
  /** Lista editável de modelos para fallback. */
  models?: string[];
  theme?: 'dark' | 'light';
  userName?: string;
}

export function nexoraHome(): string {
  return process.env.NEXORA_HOME || path.join(os.homedir(), '.nexora');
}

export function configPath(): string {
  return path.join(nexoraHome(), 'config.json');
}

export function loadConfig(): NexoraConfig {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as NexoraConfig;
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function saveConfig(patch: Partial<NexoraConfig>): NexoraConfig {
  const next = { ...loadConfig(), ...patch };
  for (const key of Object.keys(next) as (keyof NexoraConfig)[]) {
    if (next[key] === undefined || next[key] === '') delete next[key];
  }
  fs.mkdirSync(nexoraHome(), { recursive: true });
  // 0o600: só o dono do arquivo lê a chave (no Windows o modo é ignorado).
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(configPath(), 0o600);
  } catch {
    /* sem suporte no SO */
  }
  return next;
}

/** A variável de ambiente GROQ_API_KEY tem prioridade sobre o arquivo de config. */
export function getApiKey(cfg: NexoraConfig = loadConfig()): string | undefined {
  return process.env.GROQ_API_KEY?.trim() || cfg.apiKey?.trim() || undefined;
}

/** Lista de modelos com o preferido primeiro, sem duplicatas. */
export function getModelChain(cfg: NexoraConfig = loadConfig(), preferred?: string): string[] {
  const base = cfg.models && cfg.models.length > 0 ? cfg.models : DEFAULT_MODELS;
  const first = preferred || process.env.NEXORA_MODEL || cfg.model;
  const chain = first ? [first, ...base] : [...base];
  return [...new Set(chain.filter(Boolean))];
}

export function maskKey(key?: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}
