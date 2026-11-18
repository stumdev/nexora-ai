// Tipos compartilhados entre core, CLI, servidor e web.
// Este arquivo NÃO pode importar nada de Node (é usado no navegador).

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  /** Argumentos em JSON (string), como o modelo enviou. */
  arguments: string;
}

/** Informação extra para exibir o resultado de uma ferramenta (diff, artefato...). */
export interface ToolDisplay {
  title?: string;
  summary?: string;
  diff?: string;
  artifact?: Artifact;
}

export interface ChatMessage {
  role: Role;
  content: string;
  /** Texto mostrado na interface quando diferente do enviado ao modelo (ex.: /plano expandido). */
  display?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
  isError?: boolean;
  toolDisplay?: ToolDisplay;
}

export interface StoredMessage extends ChatMessage {
  id: number;
  conversationId: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  source: 'cli' | 'web';
}

export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface Artifact {
  id: string;
  title: string;
  kind: 'markdown' | 'svg' | 'html';
  content: string;
  /** Arquivos salvos em disco (ex.: cartaz.svg, cartaz.png). */
  files?: string[];
}

export type PermissionDecision = 'yes' | 'always' | 'no';

export interface PermissionRequest {
  id: string;
  tool: string;
  title: string;
  /** Diff unificado (Write/Edit) */
  diff?: string;
  /** Comando (Bash) */
  command?: string;
}

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_start'; id: string; name: string; title: string; input: unknown }
  | { type: 'tool_end'; id: string; name: string; output: string; isError: boolean; display?: ToolDisplay }
  | { type: 'permission'; request: PermissionRequest }
  | { type: 'todos'; todos: Todo[] }
  | { type: 'artifact'; artifact: Artifact }
  | { type: 'model'; model: string; reason: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'message'; message: ChatMessage }
  | { type: 'error'; message: string }
  | { type: 'done'; aborted: boolean };

export interface SkillInfo {
  name: string;
  description: string;
  argumentHint?: string;
}
