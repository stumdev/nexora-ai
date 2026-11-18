import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { Todo } from '@nexora/core';
import { asciiLogo, colors } from '../theme';
import { renderMarkdown } from '../markdown';

export function Banner({ model, cwd, version, columns }: { model: string; cwd: string; version: string; columns: number }) {
  const wide = columns >= 64;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box borderStyle="round" borderColor={colors.lime} flexDirection="column" paddingX={1} width={Math.min(columns, 72)}>
        <Text>
          <Text color={colors.lime}>✻ </Text>
          <Text bold>Bem-vindo à Nexora AI!</Text>
          <Text color={colors.muted}> v{version}</Text>
        </Text>
        {wide ? (
          <Box flexDirection="column" marginY={1}>
            {asciiLogo().map((row, i) => (
              <Text key={i} color={i < 3 ? colors.lime : colors.limeDim}>
                {row}
              </Text>
            ))}
          </Box>
        ) : (
          <Text color={colors.lime} bold>
            NEXORA AI
          </Text>
        )}
        <Text italic>Da ideia ao negócio, com inteligência.</Text>
        <Text> </Text>
        <Text color={colors.muted}>
          modelo: <Text color={colors.text}>{model}</Text>
        </Text>
        <Text color={colors.muted} wrap="truncate-start">
          pasta: <Text color={colors.text}>{cwd}</Text>
        </Text>
      </Box>
      <Box flexDirection="column" paddingLeft={1} marginTop={1}>
        <Text color={colors.muted}>Dicas para começar:</Text>
        <Text color={colors.muted}>
          1. Conte sua ideia ou problema (ex.: <Text color={colors.text}>"Quero abrir uma loja de roupas online"</Text>)
        </Text>
        <Text color={colors.muted}>
          2. Use <Text color={colors.lime}>/plano</Text>, <Text color={colors.lime}>/marketing</Text>, <Text color={colors.lime}>/financeiro</Text>,{' '}
          <Text color={colors.lime}>/cartaz</Text> ou <Text color={colors.lime}>/demo</Text> · <Text color={colors.lime}>/help</Text> para tudo
        </Text>
        <Text color={colors.muted}>3. Revise as sugestões: a decisão final é sua.</Text>
      </Box>
    </Box>
  );
}

export function UserMessage({ text }: { text: string }) {
  return (
    <Box marginBottom={1} paddingLeft={0}>
      <Text color={colors.muted}>{'> '}</Text>
      <Text color={colors.text}>{text}</Text>
    </Box>
  );
}

export function AssistantMessage({ text, columns }: { text: string; columns: number }) {
  const rendered = renderMarkdown(text, columns - 2);
  if (!rendered) return null;
  return (
    <Box marginBottom={1} flexDirection="row">
      <Box width={2} flexShrink={0}>
        <Text color={colors.lime}>●</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <Text>{rendered}</Text>
      </Box>
    </Box>
  );
}

/** Diff colorido (verde/vermelho) com números de linha. */
export function DiffView({ diff, maxLines = 40 }: { diff: string; maxLines?: number }) {
  const rows: { kind: 'add' | 'del' | 'ctx' | 'hunk'; text: string; num?: number }[] = [];
  let oldLn = 0;
  let newLn = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (h) {
      oldLn = Number(h[1]);
      newLn = Number(h[2]);
      if (rows.length) rows.push({ kind: 'hunk', text: '…' });
      continue;
    }
    if (line.startsWith('+')) rows.push({ kind: 'add', text: line.slice(1), num: newLn++ });
    else if (line.startsWith('-')) rows.push({ kind: 'del', text: line.slice(1), num: oldLn++ });
    else {
      rows.push({ kind: 'ctx', text: line.slice(1), num: newLn });
      oldLn++;
      newLn++;
    }
  }
  const shown = rows.slice(0, maxLines);
  const width = String(Math.max(1, ...shown.map((r) => r.num ?? 0))).length;
  return (
    <Box flexDirection="column">
      {shown.map((r, i) =>
        r.kind === 'hunk' ? (
          <Text key={i} color={colors.muted}>
            {' '.repeat(width)} ⋮
          </Text>
        ) : (
          <Text key={i} wrap="truncate-end">
            <Text color={colors.muted}>{String(r.num).padStart(width)} </Text>
            {r.kind === 'add' ? (
              <Text backgroundColor={colors.diffAddBg} color={colors.green}>
                {'+ '}
                {r.text}
              </Text>
            ) : r.kind === 'del' ? (
              <Text backgroundColor={colors.diffDelBg} color={colors.red}>
                {'- '}
                {r.text}
              </Text>
            ) : (
              <Text color={colors.muted}>
                {'  '}
                {r.text}
              </Text>
            )}
          </Text>
        ),
      )}
      {rows.length > maxLines && <Text color={colors.muted}>… +{rows.length - maxLines} linhas</Text>}
    </Box>
  );
}

export interface ToolItem {
  id: string;
  name: string;
  title: string;
  status: 'running' | 'ok' | 'error';
  summary?: string;
  output?: string;
  diff?: string;
}

export function ToolBlock({ item }: { item: ToolItem }) {
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    if (item.status !== 'running') return;
    const t = setInterval(() => setBlink((b) => !b), 500);
    return () => clearInterval(t);
  }, [item.status]);
  const dotColor = item.status === 'error' ? colors.red : item.status === 'ok' ? colors.lime : blink ? colors.muted : colors.border;
  const title = item.title.length > 70 ? item.title.slice(0, 67) + '…' : item.title;
  const errorLine = item.status === 'error' ? (item.output ?? '').split('\n')[0].slice(0, 200) : '';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text color={dotColor}>● </Text>
        <Text bold>{item.name}</Text>
        <Text color={colors.muted}>({title})</Text>
      </Text>
      {item.status !== 'running' && (
        <Box paddingLeft={2} flexDirection="column">
          <Text color={item.status === 'error' ? colors.red : colors.muted}>
            {'⎿  '}
            {item.status === 'error' ? errorLine || 'Erro' : item.summary || 'Concluído'}
          </Text>
          {item.diff && item.status === 'ok' && (
            <Box paddingLeft={3}>
              <DiffView diff={item.diff} />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

export function TodoList({ todos }: { todos: Todo[] }) {
  if (!todos.length) return null;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text color={colors.lime}>● </Text>
        <Text bold>Tarefas</Text>
      </Text>
      {todos.map((t, i) => (
        <Box key={i} paddingLeft={2}>
          <Text
            color={t.status === 'completed' ? colors.muted : t.status === 'in_progress' ? colors.lime : colors.text}
            strikethrough={t.status === 'completed'}
            bold={t.status === 'in_progress'}
          >
            {i === 0 ? '⎿  ' : '   '}
            {t.status === 'completed' ? '☒' : '☐'} {t.content}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const VERBS = ['Pensando', 'Planejando', 'Analisando', 'Calculando', 'Rascunhando', 'Organizando', 'Pesquisando', 'Estruturando', 'Empreendendo'];

export function Spinner({ startedAt, tokens, label }: { startedAt: number; tokens: number; label?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 120);
    return () => clearInterval(t);
  }, []);
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const verb = label ?? VERBS[Math.floor(tick / 25) % VERBS.length];
  const tk = tokens > 0 ? ` · ↓ ${tokens >= 1000 ? (tokens / 1000).toFixed(1) + 'k' : tokens} tokens` : '';
  return (
    <Box marginBottom={1}>
      <Text color={colors.lime}>{FRAMES[tick % FRAMES.length]} </Text>
      <Text color={colors.lime}>{verb}… </Text>
      <Text color={colors.muted}>
        ({secs}s{tk} · <Text bold>esc</Text> para interromper)
      </Text>
    </Box>
  );
}

export function InfoLine({ text, color }: { text: string; color?: string }) {
  return (
    <Box marginBottom={1}>
      <Text color={color ?? colors.muted}>{text}</Text>
    </Box>
  );
}
