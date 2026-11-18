import fs from 'node:fs';
import path from 'node:path';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Static, Text, useApp, useInput, useStdout } from 'ink';
import {
  ChatSession,
  GROQ_KEYS_URL,
  Store,
  VERSION,
  conversationToMarkdown,
  getApiKey,
  saveConfig,
  type PermissionDecision,
  type PermissionRequest,
  type Provider,
  type StoredMessage,
  type Todo,
} from '@nexora/core';
import { colors } from './theme';
import { AssistantMessage, Banner, InfoLine, Spinner, TodoList, ToolBlock, UserMessage, type ToolItem } from './components/Blocks';
import { PromptInput, type CommandInfo } from './components/PromptInput';
import { PermissionPrompt, Select, type SelectItem } from './components/Select';

type Item =
  | { key: string; kind: 'banner' }
  | { key: string; kind: 'user'; text: string }
  | { key: string; kind: 'assistant'; text: string }
  | { key: string; kind: 'tool'; tool: ToolItem }
  | { key: string; kind: 'todos'; todos: Todo[] }
  | { key: string; kind: 'info'; text: string; color?: string };

type Picker =
  | { kind: 'model'; items: SelectItem<string>[] }
  | { kind: 'resume'; items: SelectItem<string>[] };

const BUILTIN: CommandInfo[] = [
  { name: 'help', description: 'Ajuda: como funciona, comandos e atalhos' },
  { name: 'clear', description: 'Começa uma nova conversa' },
  { name: 'model', description: 'Escolhe o modelo da Groq', argumentHint: '[nome]' },
  { name: 'resume', description: 'Retoma uma conversa anterior' },
  { name: 'export', description: 'Salva a conversa em .md', argumentHint: '[arquivo]' },
  { name: 'key', description: 'Configura a chave da Groq' },
  { name: 'exit', description: 'Sair' },
];

let keySeq = 0;
const k = () => `i${++keySeq}`;

export interface AppProps {
  store: Store;
  cwd: string;
  initialPrompt?: string;
  continueLast?: boolean;
  model?: string;
  /** Usado nos testes (provider falso). */
  provider?: Provider;
}

export function App({ store, cwd, initialPrompt, continueLast, model, provider }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [columns, setColumns] = useState(stdout.columns || 80);
  const sessionRef = useRef<ChatSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new ChatSession({ store, cwd, source: 'cli', provider });
    if (model) sessionRef.current.setModel(model);
  }
  const session = sessionRef.current;

  const [items, setItems] = useState<Item[]>([{ key: k(), kind: 'banner' }]);
  const [staticKey, setStaticKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [liveTools, setLiveTools] = useState<ToolItem[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [permission, setPermission] = useState<{ req: PermissionRequest; resolve: (d: PermissionDecision) => void } | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [needKey, setNeedKey] = useState(!getApiKey());
  const [startedAt, setStartedAt] = useState(Date.now());
  const [tokens, setTokens] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [modelName, setModelName] = useState(session.model);
  const [exitArmed, setExitArmed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const textRef = useRef('');
  const flushTimer = useRef<NodeJS.Timeout | null>(null);
  const started = useRef(false);

  const commands: CommandInfo[] = [
    ...BUILTIN,
    ...session.skills.map((s) => ({ name: s.name, description: s.description, argumentHint: s.argumentHint })),
  ];

  useEffect(() => {
    const onResize = () => setColumns(stdout.columns || 80);
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  const push = useCallback((...newItems: Item[]) => setItems((prev) => [...prev, ...newItems]), []);
  const info = useCallback((text: string, color?: string) => push({ key: k(), kind: 'info', text, color }), [push]);

  /** Move o texto em streaming para o histórico estático. */
  const flushText = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const t = textRef.current;
    textRef.current = '';
    setStreamText('');
    if (t.trim()) push({ key: k(), kind: 'assistant', text: t });
  }, [push]);

  const renderStored = useCallback(
    (msgs: StoredMessage[]) => {
      const out: Item[] = [];
      for (const m of msgs) {
        if (m.role === 'user') out.push({ key: k(), kind: 'user', text: m.display ?? m.content });
        else if (m.role === 'assistant' && m.content.trim()) out.push({ key: k(), kind: 'assistant', text: m.content });
        else if (m.role === 'tool')
          out.push({
            key: k(),
            kind: 'tool',
            tool: {
              id: m.toolCallId ?? k(),
              name: m.name ?? 'Tool',
              title: m.toolDisplay?.title ?? '',
              status: m.isError ? 'error' : 'ok',
              summary: m.toolDisplay?.summary,
              output: m.content,
            },
          });
      }
      push(...out);
    },
    [push],
  );

  const runPrompt = useCallback(
    async (text: string, opts: { regenerate?: boolean } = {}) => {
      const ac = new AbortController();
      abortRef.current = ac;
      setRunning(true);
      setStartedAt(Date.now());
      setTokens(0);
      textRef.current = '';
      const ask = (req: PermissionRequest) =>
        new Promise<PermissionDecision>((resolve) => {
          flushText();
          setPermission({
            req,
            resolve: (d) => {
              setPermission(null);
              resolve(d);
            },
          });
          ac.signal.addEventListener('abort', () => {
            setPermission(null);
            resolve('no');
          }, { once: true });
        });
      try {
        const events = opts.regenerate ? session.regenerate(ac.signal, ask) : session.send(text, ac.signal, ask);
        for await (const ev of events) {
          switch (ev.type) {
            case 'text':
              textRef.current += ev.delta;
              if (!flushTimer.current) {
                flushTimer.current = setTimeout(() => {
                  flushTimer.current = null;
                  setStreamText(textRef.current);
                }, 40);
              }
              break;
            case 'tool_start':
              flushText();
              setLiveTools((t) => [...t, { id: ev.id, name: ev.name, title: ev.title, status: 'running' }]);
              break;
            case 'tool_end': {
              setLiveTools((t) => t.filter((x) => x.id !== ev.id));
              push({
                key: k(),
                kind: 'tool',
                tool: {
                  id: ev.id,
                  name: ev.name,
                  title: ev.display?.title ?? (liveTitle(ev.id) || ''),
                  status: ev.isError ? 'error' : 'ok',
                  summary: ev.display?.summary,
                  output: ev.output,
                  diff: ev.display?.diff,
                },
              });
              break;
            }
            case 'todos':
              setTodos(ev.todos);
              push({ key: k(), kind: 'todos', todos: ev.todos });
              break;
            case 'artifact':
              if (ev.artifact.files?.length) info(`  Arquivos: ${ev.artifact.files.join(', ')}`, colors.lime);
              break;
            case 'model':
              setModelName(session.model);
              info(`↻ Trocando para ${ev.model} (${ev.reason})`, colors.muted);
              break;
            case 'usage':
              setTokens((t) => t + ev.completionTokens);
              break;
            case 'error':
              flushText();
              info(`✗ ${ev.message}`, colors.red);
              break;
            case 'done':
              flushText();
              if (ev.aborted) info('⎿  Interrompido pelo usuário', colors.red);
              break;
          }
        }
      } catch (err) {
        flushText();
        info(`✗ Erro inesperado: ${(err as Error).message}`, colors.red);
      } finally {
        abortRef.current = null;
        setLiveTools([]);
        setRunning(false);
        setModelName(session.model);
      }
    },
    [session, push, info, flushText],
  );

  // título dos blocos de ferramenta (guardado no início da execução)
  const liveToolsRef = useRef<ToolItem[]>([]);
  liveToolsRef.current = liveTools;
  function liveTitle(id: string) {
    return liveToolsRef.current.find((t) => t.id === id)?.title;
  }

  const clearScreen = () => {
    stdout.write('\x1b[2J\x1b[3J\x1b[H');
    setItems([{ key: k(), kind: 'banner' }]);
    setStaticKey((s) => s + 1);
    setTodos([]);
  };

  const handleCommand = (text: string): boolean => {
    const m = /^\/([\w-]+)\s*([\s\S]*)$/.exec(text.trim());
    if (!m) return false;
    const [, name, args] = m;
    switch (name) {
      case 'help':
        push({
          key: k(),
          kind: 'assistant',
          text: [
            '## Nexora AI — ajuda',
            '**Como funciona:** 1) você explica a ideia ou o problema → 2) a Nexora analisa e sugere → 3) você revisa e decide.',
            '',
            '**Comandos de negócio**',
            ...session.skills.map((s) => `- \`/${s.name}\` ${s.argumentHint ?? ''} — ${s.description}`),
            '',
            '**Comandos gerais**',
            ...BUILTIN.map((c) => `- \`/${c.name}\` ${c.argumentHint ?? ''} — ${c.description}`),
            '',
            '**Atalhos:** `Enter` envia · `\\` + `Enter` ou `Alt+Enter` nova linha · `↑/↓` histórico · `Tab` completa comandos · `Esc` interrompe/limpa · `Ctrl+C` duas vezes sai',
            '',
            'Coloque um `NEXORA.md` na pasta com informações do seu negócio para a Nexora usar como contexto.',
          ].join('\n'),
        });
        return true;
      case 'clear':
        session.newConversation();
        clearScreen();
        return true;
      case 'exit':
      case 'quit':
        exit();
        return true;
      case 'key':
        setNeedKey(true);
        return true;
      case 'model': {
        if (args.trim()) {
          session.setModel(args.trim());
          saveConfig({ model: args.trim() });
          setModelName(session.model);
          info(`Modelo definido: ${session.model}`, colors.lime);
        } else {
          setPicker({ kind: 'model', items: session.models.map((mm, i) => ({ label: mm, value: mm, hint: i === 0 ? '(atual)' : '' })) });
        }
        return true;
      }
      case 'resume': {
        if (args.trim()) {
          resumeConversation(args.trim());
          return true;
        }
        const convs = store.listConversations(30);
        if (!convs.length) {
          info('Nenhuma conversa anterior.');
          return true;
        }
        setPicker({
          kind: 'resume',
          items: convs.map((c) => ({
            label: c.title,
            value: c.id,
            hint: `${new Date(c.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${c.source}`,
          })),
        });
        return true;
      }
      case 'export': {
        if (!session.conversationId) {
          info('Nada para exportar ainda.');
          return true;
        }
        const conv = store.getConversation(session.conversationId)!;
        const file = path.resolve(cwd, args.trim() || `nexora-conversa-${conv.id.slice(0, 8)}.md`);
        fs.writeFileSync(file, conversationToMarkdown(conv, store.getMessages(conv.id)), 'utf8');
        info(`✓ Conversa exportada para ${file}`, colors.lime);
        return true;
      }
      default:
        if (session.skills.some((s) => s.name === name)) return false; // skill: vai para o agente
        info(`Comando desconhecido: /${name}. Digite /help.`, colors.red);
        return true;
    }
  };

  const resumeConversation = (id: string) => {
    if (!session.resume(id)) {
      info('Conversa não encontrada.', colors.red);
      return;
    }
    const conv = store.getConversation(session.conversationId!)!;
    clearScreen();
    info(`↺ Retomando: ${conv.title}`, colors.lime);
    renderStored(store.getMessages(conv.id));
  };

  const onSubmit = (text: string) => {
    setHistory((h) => (h[h.length - 1] === text ? h : [...h, text]));
    setExitArmed(false);
    if (text.trim().startsWith('/') && handleCommand(text)) return;
    const skill = /^\/([\w-]+)/.exec(text.trim());
    push({ key: k(), kind: 'user', text: skill ? text.trim() : text });
    void runPrompt(text);
  };

  // atalhos globais: Esc interrompe; Ctrl+C interrompe ou sai
  useInput((input, key) => {
    if (!running) return;
    if (permission) return;
    if (key.escape || (key.ctrl && input === 'c')) abortRef.current?.abort();
  });

  const onCtrlC = (hasText: boolean) => {
    if (hasText) return false;
    if (exitArmed) {
      exit();
      return true;
    }
    setExitArmed(true);
    setTimeout(() => setExitArmed(false), 2000);
    return true;
  };

  // prompt inicial / --continue
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (continueLast) {
      const last = store.listConversations(1)[0];
      if (last) resumeConversation(last.id);
    }
    if (initialPrompt && getApiKey()) onSubmit(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const width = Math.max(30, columns - 1);

  return (
    <Box flexDirection="column">
      <Static key={staticKey} items={items}>
        {(item) => {
          switch (item.kind) {
            case 'banner':
              return <Banner key={item.key} model={modelName} cwd={cwd} version={VERSION} columns={columns} />;
            case 'user':
              return <UserMessage key={item.key} text={item.text} />;
            case 'assistant':
              return <AssistantMessage key={item.key} text={item.text} columns={columns} />;
            case 'tool':
              return <ToolBlock key={item.key} item={item.tool} />;
            case 'todos':
              return <TodoList key={item.key} todos={item.todos} />;
            case 'info':
              return <InfoLine key={item.key} text={item.text} color={item.color} />;
          }
        }}
      </Static>

      {streamText && <AssistantMessage text={streamText} columns={columns} />}
      {liveTools.map((t) => (
        <ToolBlock key={t.id} item={t} />
      ))}

      {needKey ? (
        <KeySetup
          columns={width}
          onDone={(key) => {
            setNeedKey(false);
            if (key) {
              saveConfig({ apiKey: key });
              info('✓ Chave salva em ~/.nexora/config.json', colors.lime);
              if (initialPrompt && items.length <= 1) onSubmit(initialPrompt);
            }
          }}
        />
      ) : permission ? (
        <PermissionPrompt request={permission.req} onDecide={permission.resolve} />
      ) : picker ? (
        <Select
          title={picker.kind === 'model' ? 'Escolha o modelo' : 'Retomar conversa'}
          items={picker.items}
          onCancel={() => setPicker(null)}
          onSelect={(v) => {
            const p = picker;
            setPicker(null);
            if (p.kind === 'model') {
              session.setModel(v);
              saveConfig({ model: v });
              setModelName(session.model);
              info(`Modelo definido: ${v}`, colors.lime);
            } else resumeConversation(v);
          }}
        />
      ) : running ? (
        <Spinner startedAt={startedAt} tokens={tokens} />
      ) : (
        <PromptInput
          onSubmit={onSubmit}
          history={history}
          commands={commands}
          columns={width}
          onCtrlC={onCtrlC}
          footer={
            exitArmed
              ? 'Pressione Ctrl+C de novo para sair'
              : `? /help · / comandos · \\⏎ nova linha  —  ${modelName}${todos.length ? ` · ${todos.filter((t) => t.status === 'completed').length}/${todos.length} tarefas` : ''}`
          }
        />
      )}
    </Box>
  );
}

function KeySetup({ onDone, columns }: { onDone: (key?: string) => void; columns: number }) {
  const [status, setStatus] = useState<string>('');
  const [testing, setTesting] = useState(false);
  useInput((_i, key) => {
    if (key.escape && !testing) onDone();
  });
  const test = async (key: string) => {
    setTesting(true);
    setStatus('Testando a chave…');
    try {
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
      if (r.ok) return onDone(key);
      setStatus(r.status === 401 ? '✗ Chave inválida. Tente de novo.' : `✗ A Groq respondeu ${r.status}. Tente de novo.`);
    } catch (err) {
      setStatus(`✗ Falha de rede: ${(err as Error).message}`);
    } finally {
      setTesting(false);
    }
  };
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={colors.lime} flexDirection="column" paddingX={1} marginBottom={1} width={columns}>
        <Text bold>Configurar a chave gratuita da Groq</Text>
        <Text color={colors.muted}>1. Crie uma conta grátis e gere uma chave em: </Text>
        <Text color={colors.lime}>   {GROQ_KEYS_URL}</Text>
        <Text color={colors.muted}>2. Cole a chave abaixo e pressione Enter (Esc para pular).</Text>
        <Text color={colors.muted}>A chave fica só no seu computador (~/.nexora/config.json). Você também pode usar a variável GROQ_API_KEY.</Text>
        {status && <Text color={status.startsWith('✗') ? colors.red : colors.muted}>{status}</Text>}
      </Box>
      {!testing && (
        <PromptInput
          mask
          placeholder="gsk_..."
          onSubmit={(v) => void test(v.trim())}
          history={[]}
          commands={[]}
          columns={columns}
        />
      )}
    </Box>
  );
}
