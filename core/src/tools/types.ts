import type { AgentEvent, ToolDisplay } from '../types';

export interface ToolContext {
  cwd: string;
  signal: AbortSignal;
  /** Envia eventos extras (todos, artefatos) para a interface. */
  emit: (event: AgentEvent) => void;
}

export interface ToolResult {
  output: string;
  isError?: boolean;
  display?: ToolDisplay;
}

export interface PermissionPreview {
  title: string;
  diff?: string;
  command?: string;
}

export interface Tool<I = any> {
  name: string;
  description: string;
  /** JSON Schema dos argumentos. */
  parameters: Record<string, unknown>;
  /** Write, Edit e Bash pedem permissão. */
  needsPermission?: boolean;
  /** Título curto para o bloco "● Nome(título)". */
  title: (input: I) => string;
  preview?: (input: I, ctx: ToolContext) => Promise<PermissionPreview> | PermissionPreview;
  run: (input: I, ctx: ToolContext) => Promise<ToolResult>;
}

export function requireString(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  if (typeof v !== 'string' || v.length === 0) throw new Error(`Parâmetro obrigatório ausente: "${key}"`);
  return v;
}
