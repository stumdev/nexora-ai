import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PermissionDecision, PermissionRequest } from '@nexora/core';
import { colors } from '../theme';
import { DiffView } from './Blocks';

export interface SelectItem<T> {
  label: string;
  value: T;
  hint?: string;
}

/** Lista navegável por setas ou número; Enter escolhe, Esc cancela. */
export function Select<T>({
  title,
  items,
  onSelect,
  onCancel,
}: {
  title: string;
  items: SelectItem<T>[];
  onSelect: (v: T) => void;
  onCancel: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const pageSize = 10;
  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) return onCancel();
    if (key.upArrow) return setIdx((i) => (i - 1 + items.length) % items.length);
    if (key.downArrow) return setIdx((i) => (i + 1) % items.length);
    if (key.return) return items[idx] && onSelect(items[idx].value);
    const n = Number(input);
    if (n >= 1 && n <= Math.min(9, items.length)) onSelect(items[n - 1].value);
  });
  const start = Math.max(0, Math.min(idx - Math.floor(pageSize / 2), items.length - pageSize));
  const visible = items.slice(start, start + pageSize);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.lime} paddingX={1} marginBottom={1}>
      <Text bold>{title}</Text>
      {visible.map((it, i) => {
        const real = start + i;
        const active = real === idx;
        return (
          <Text key={real} wrap="truncate-end">
            <Text color={active ? colors.lime : colors.muted}>{active ? '❯ ' : '  '}</Text>
            <Text color={active ? colors.lime : colors.text}>
              {real + 1}. {it.label}
            </Text>
            {it.hint && <Text color={colors.muted}> {it.hint}</Text>}
          </Text>
        );
      })}
      <Text color={colors.muted}>↑/↓ para navegar · Enter para escolher · Esc para cancelar</Text>
    </Box>
  );
}

/** Tela de permissão: diff/comando em destaque e 3 opções numeradas. */
export function PermissionPrompt({ request, onDecide }: { request: PermissionRequest; onDecide: (d: PermissionDecision) => void }) {
  const options: SelectItem<PermissionDecision>[] = [
    { label: 'Sim', value: 'yes' },
    { label: `Sim, não perguntar de novo nesta sessão (${request.tool})`, value: 'always' },
    { label: 'Não', value: 'no' },
  ];
  const [idx, setIdx] = useState(0);
  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) return onDecide('no');
    if (key.upArrow) return setIdx((i) => (i + 2) % 3);
    if (key.downArrow) return setIdx((i) => (i + 1) % 3);
    if (key.return) return onDecide(options[idx].value);
    const n = Number(input);
    if (n >= 1 && n <= 3) onDecide(options[n - 1].value);
  });
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.lime} paddingX={1} marginBottom={1}>
      <Text bold color={colors.lime}>
        {request.tool}
      </Text>
      <Text>{request.title}</Text>
      {request.command && (
        <Box borderStyle="single" borderColor={colors.border} paddingX={1} marginY={1}>
          <Text color={colors.text}>{request.command}</Text>
        </Box>
      )}
      {request.diff && (
        <Box marginY={1} flexDirection="column">
          <DiffView diff={request.diff} maxLines={30} />
        </Box>
      )}
      <Text>Você permite esta ação?</Text>
      {options.map((o, i) => (
        <Text key={o.value}>
          <Text color={i === idx ? colors.lime : colors.muted}>{i === idx ? '❯ ' : '  '}</Text>
          <Text color={i === idx ? colors.lime : colors.text}>
            {i + 1}. {o.label}
          </Text>
        </Text>
      ))}
    </Box>
  );
}
