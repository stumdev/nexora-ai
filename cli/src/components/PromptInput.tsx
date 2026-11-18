import React, { useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme';

export interface CommandInfo {
  name: string;
  description: string;
  argumentHint?: string;
}

interface Props {
  onSubmit: (text: string) => void;
  history: string[];
  commands: CommandInfo[];
  columns: number;
  footer?: string;
  /** Mostra máscara (para digitar a chave da API). */
  mask?: boolean;
  placeholder?: string;
  onCtrlC?: (hasText: boolean) => boolean | void;
}

export function filterCommands(value: string, commands: CommandInfo[]): CommandInfo[] {
  if (!value.startsWith('/') || value.includes(' ') || value.includes('\n')) return [];
  const q = value.slice(1).toLowerCase();
  return commands.filter((c) => c.name.toLowerCase().startsWith(q)).slice(0, 8);
}

/**
 * Campo de texto com borda arredondada: multilinha (\ + Enter ou Alt+Enter),
 * histórico com ↑/↓, Tab completa /comandos, Esc limpa.
 */
export function PromptInput({ onSubmit, history, commands, columns, footer, mask, placeholder, onCtrlC }: Props) {
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState(0);
  // refs com o estado "ao vivo": várias teclas podem chegar antes de o React renderizar de novo
  const live = useRef({ value: '', cursor: 0, histIdx: -1 });
  const draft = useRef('');

  const suggestions = useMemo(() => (mask ? [] : filterCommands(value, commands)), [value, commands, mask]);
  const selIdx = Math.min(sel, Math.max(0, suggestions.length - 1));

  const set = (v: string, c = v.length) => {
    const cur = Math.max(0, Math.min(c, v.length));
    live.current.value = v;
    live.current.cursor = cur;
    setValue(v);
    setCursor(cur);
    setSel(0);
  };
  const moveTo = (c: number) => {
    const cur = Math.max(0, Math.min(c, live.current.value.length));
    live.current.cursor = cur;
    setCursor(cur);
  };
  const setHist = (v: string, idx: number) => {
    live.current.histIdx = idx;
    set(v);
  };

  const submit = (text: string) => {
    set('');
    live.current.histIdx = -1;
    onSubmit(text);
  };

  useInput((input, key) => {
    const { value, cursor, histIdx } = live.current;
    const suggestions = mask ? [] : filterCommands(value, commands);
    if (key.ctrl && input === 'c') {
      const handled = onCtrlC?.(value.length > 0);
      if (value.length > 0 && !handled) set('');
      return;
    }
    if (key.return) {
      if (key.meta || (value[cursor - 1] === '\\' && !mask)) {
        const before = key.meta ? value.slice(0, cursor) : value.slice(0, cursor - 1);
        set(before + '\n' + value.slice(cursor), before.length + 1);
        return;
      }
      if (suggestions.length > 0) {
        const s = suggestions[selIdx];
        if (value.slice(1) !== s.name && s.argumentHint) {
          set(`/${s.name} `);
          return;
        }
        submit(`/${s.name}`);
        return;
      }
      if (value.trim()) submit(value);
      return;
    }
    if (key.tab) {
      if (suggestions.length > 0) set(`/${suggestions[selIdx].name} `);
      return;
    }
    if (key.escape) {
      set('');
      return;
    }
    if (key.upArrow) {
      if (suggestions.length > 0) return setSel((s) => (s - 1 + suggestions.length) % suggestions.length);
      const lineStart = value.lastIndexOf('\n', cursor - 1);
      if (lineStart >= 0) {
        // sobe uma linha dentro do texto multilinha
        const prevStart = value.lastIndexOf('\n', lineStart - 1) + 1;
        const col = cursor - lineStart - 1;
        moveTo(Math.min(prevStart + col, lineStart));
        return;
      }
      if (history.length === 0) return;
      if (histIdx === -1) draft.current = value;
      const next = Math.min(histIdx + 1, history.length - 1);
      setHist(history[history.length - 1 - next], next);
      return;
    }
    if (key.downArrow) {
      if (suggestions.length > 0) return setSel((s) => (s + 1) % suggestions.length);
      const nextNl = value.indexOf('\n', cursor);
      if (nextNl >= 0) {
        const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
        const col = cursor - lineStart;
        const nextEnd = value.indexOf('\n', nextNl + 1);
        moveTo(Math.min(nextNl + 1 + col, nextEnd === -1 ? value.length : nextEnd));
        return;
      }
      if (histIdx === -1) return;
      const next = histIdx - 1;
      setHist(next === -1 ? draft.current : history[history.length - 1 - next], next);
      return;
    }
    if (key.leftArrow) return moveTo(cursor - 1);
    if (key.rightArrow) return moveTo(cursor + 1);
    if (key.ctrl && input === 'a') return moveTo(value.lastIndexOf('\n', cursor - 1) + 1);
    if (key.ctrl && input === 'e') {
      const nl = value.indexOf('\n', cursor);
      return moveTo(nl === -1 ? value.length : nl);
    }
    if (key.ctrl && input === 'u') return set(value.slice(cursor), 0);
    if (key.ctrl && input === 'w') {
      const before = value.slice(0, cursor).replace(/\S+\s*$/, '');
      return set(before + value.slice(cursor), before.length);
    }
    if (key.backspace || key.delete) {
      if (cursor === 0) return;
      return set(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1);
    }
    if (key.ctrl || key.meta) return;
    if (input) {
      const text = input.replace(/\r\n?/g, '\n');
      set(value.slice(0, cursor) + text + value.slice(cursor), cursor + text.length);
    }
  });

  const display = mask ? '•'.repeat(value.length) : value;
  const lines = display.split('\n');
  // posição do cursor (linha/coluna)
  let rest = cursor;
  let curLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (rest <= lines[i].length) {
      curLine = i;
      break;
    }
    rest -= lines[i].length + 1;
  }
  const curCol = rest;

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={colors.border} paddingX={1} flexDirection="column" width={columns}>
        {value.length === 0 ? (
          <Text>
            <Text color={colors.lime}>{'> '}</Text>
            <Text inverse> </Text>
            <Text color={colors.muted}>{placeholder ?? 'Conte sua ideia ou digite / para ver os comandos'}</Text>
          </Text>
        ) : (
          lines.map((line, i) => (
            <Text key={i}>
              <Text color={colors.lime}>{i === 0 ? '> ' : '  '}</Text>
              {i === curLine ? (
                <>
                  {line.slice(0, curCol)}
                  <Text inverse>{line[curCol] ?? ' '}</Text>
                  {line.slice(curCol + 1)}
                </>
              ) : (
                line || ' '
              )}
            </Text>
          ))
        )}
      </Box>
      {suggestions.length > 0 ? (
        <Box flexDirection="column" paddingX={2}>
          {suggestions.map((s, i) => (
            <Text key={s.name} wrap="truncate-end">
              <Text color={i === selIdx ? colors.lime : colors.text} bold={i === selIdx}>
                {`/${s.name}`.padEnd(14)}
              </Text>
              <Text color={i === selIdx ? colors.text : colors.muted}>
                {s.description}
                {s.argumentHint ? ` ${s.argumentHint}` : ''}
              </Text>
            </Text>
          ))}
        </Box>
      ) : (
        footer && (
          <Box paddingX={2}>
            <Text color={colors.muted} wrap="truncate-end">
              {footer}
            </Text>
          </Box>
        )
      )}
    </Box>
  );
}
