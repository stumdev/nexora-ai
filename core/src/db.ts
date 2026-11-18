import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { nexoraHome } from './config';
import type { ChatMessage, Conversation, StoredMessage } from './types';

type DB = Database.Database;

const MIGRATIONS: string[] = [
  `CREATE TABLE conversations (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     source TEXT NOT NULL DEFAULT 'cli',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
     role TEXT NOT NULL,
     content TEXT NOT NULL,
     display TEXT,
     tool_calls TEXT,
     tool_call_id TEXT,
     name TEXT,
     is_error INTEGER NOT NULL DEFAULT 0,
     tool_display TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX idx_messages_conv ON messages(conversation_id, id);
   CREATE INDEX idx_conv_updated ON conversations(updated_at DESC);`,
];

/** Histórico em SQLite (~/.nexora/nexora.db), compartilhado entre CLI e web. */
export class Store {
  db: DB;

  constructor(file?: string) {
    const target = file ?? path.join(nexoraHome(), 'nexora.db');
    if (target !== ':memory:') fs.mkdirSync(path.dirname(target), { recursive: true });
    this.db = new Database(target);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    const version = this.db.pragma('user_version', { simple: true }) as number;
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.db.transaction(() => {
        this.db.exec(MIGRATIONS[v]);
        this.db.pragma(`user_version = ${v + 1}`);
      })();
    }
  }

  createConversation(title: string, source: 'cli' | 'web'): Conversation {
    const now = Date.now();
    const conv: Conversation = { id: crypto.randomUUID(), title: title.slice(0, 120) || 'Nova conversa', createdAt: now, updatedAt: now, source };
    this.db
      .prepare('INSERT INTO conversations (id, title, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(conv.id, conv.title, source, now, now);
    return conv;
  }

  listConversations(limit = 200): Conversation[] {
    return (
      this.db
        .prepare('SELECT id, title, source, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT ?')
        .all(limit) as any[]
    ).map(rowToConv);
  }

  getConversation(id: string): Conversation | undefined {
    const row = this.db.prepare('SELECT id, title, source, created_at, updated_at FROM conversations WHERE id = ?').get(id);
    return row ? rowToConv(row) : undefined;
  }

  /** Aceita o id completo ou um prefixo (ex.: 8 primeiros caracteres). */
  findConversation(idOrPrefix: string): Conversation | undefined {
    const exact = this.getConversation(idOrPrefix);
    if (exact) return exact;
    const row = this.db
      .prepare('SELECT id, title, source, created_at, updated_at FROM conversations WHERE id LIKE ? ORDER BY updated_at DESC LIMIT 1')
      .get(`${idOrPrefix}%`);
    return row ? rowToConv(row) : undefined;
  }

  renameConversation(id: string, title: string): void {
    this.db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title.slice(0, 120), id);
  }

  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  addMessage(conversationId: string, m: ChatMessage): StoredMessage {
    const now = Date.now();
    const info = this.db
      .prepare(
        `INSERT INTO messages (conversation_id, role, content, display, tool_calls, tool_call_id, name, is_error, tool_display, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        conversationId,
        m.role,
        m.content ?? '',
        m.display ?? null,
        m.toolCalls?.length ? JSON.stringify(m.toolCalls) : null,
        m.toolCallId ?? null,
        m.name ?? null,
        m.isError ? 1 : 0,
        m.toolDisplay ? JSON.stringify(m.toolDisplay) : null,
        now,
      );
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
    return { ...m, id: Number(info.lastInsertRowid), conversationId, createdAt: now };
  }

  getMessages(conversationId: string): StoredMessage[] {
    return (this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id').all(conversationId) as any[]).map(rowToMsg);
  }

  /** Apaga as mensagens com id > messageId (usado para regenerar). */
  truncateAfter(conversationId: string, messageId: number): void {
    this.db.prepare('DELETE FROM messages WHERE conversation_id = ? AND id > ?').run(conversationId, messageId);
  }

  close(): void {
    this.db.close();
  }
}

function rowToConv(r: any): Conversation {
  return { id: r.id, title: r.title, source: r.source, createdAt: r.created_at, updatedAt: r.updated_at };
}

function rowToMsg(r: any): StoredMessage {
  const m: StoredMessage = {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  };
  if (r.display) m.display = r.display;
  if (r.tool_calls) m.toolCalls = JSON.parse(r.tool_calls);
  if (r.tool_call_id) m.toolCallId = r.tool_call_id;
  if (r.name) m.name = r.name;
  if (r.is_error) m.isError = true;
  if (r.tool_display) m.toolDisplay = JSON.parse(r.tool_display);
  return m;
}

/** Converte mensagens salvas em histórico para o modelo (remove campos de UI). */
export function toHistory(messages: StoredMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  const answered = new Set(messages.filter((m) => m.role === 'tool').map((m) => m.toolCallId));
  for (const m of messages) {
    const msg: ChatMessage = { role: m.role, content: m.content };
    if (m.toolCalls) {
      // descarta chamadas sem resultado (ex.: conversa interrompida) para manter o histórico válido
      const calls = m.toolCalls.filter((c) => answered.has(c.id));
      if (calls.length) msg.toolCalls = calls;
      else if (!m.content) continue;
    }
    if (m.toolCallId) msg.toolCallId = m.toolCallId;
    if (m.name) msg.name = m.name;
    out.push(msg);
  }
  return out;
}

/** Título curto a partir da primeira mensagem. */
export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? clean.slice(0, 57).trimEnd() + '…' : clean || 'Nova conversa';
}

/** Exporta a conversa como Markdown. */
export function conversationToMarkdown(conv: Conversation, messages: StoredMessage[]): string {
  const lines = [`# ${conv.title}`, '', `_Exportado da Nexora AI em ${new Date().toLocaleString('pt-BR')}_`, ''];
  for (const m of messages) {
    if (m.role === 'user') lines.push('## Você', '', m.display ?? m.content, '');
    else if (m.role === 'assistant' && m.content.trim()) lines.push('## Nexora', '', m.content, '');
    else if (m.role === 'tool') lines.push(`> 🔧 ${m.name}: ${m.toolDisplay?.summary ?? (m.isError ? 'erro' : 'ok')}`, '');
  }
  return lines.join('\n');
}
