import chalk from 'chalk';
import { ChatSession, PermissionManager, Store, getApiKey, GROQ_KEYS_URL } from '@nexora/core';
import { colors } from './theme';

/** Modo não interativo: `nexora -p "pergunta"` imprime a resposta e sai. */
export async function runPrint(prompt: string, opts: { store: Store; cwd: string; yes?: boolean; model?: string; json?: boolean }): Promise<number> {
  const err = (s: string) => process.stderr.write(s + '\n');
  if (!getApiKey()) {
    err(chalk.hex(colors.red)('✗ Nenhuma chave da Groq configurada.'));
    err(`  Pegue uma chave gratuita em ${GROQ_KEYS_URL} e rode:`);
    err('    nexora            (e cole a chave quando pedir)   ou');
    err('    defina a variável de ambiente GROQ_API_KEY');
    return 1;
  }
  const session = new ChatSession({ store: opts.store, cwd: opts.cwd, source: 'cli', permissions: new PermissionManager(!!opts.yes) });
  if (opts.model) session.setModel(opts.model);
  const ac = new AbortController();
  process.once('SIGINT', () => ac.abort());

  let exitCode = 0;
  let full = '';
  let lastWasText = false;
  for await (const ev of session.send(prompt, ac.signal, async (req) => {
    err(chalk.hex(colors.muted)(`  (${req.tool} negado no modo -p; use --yes para permitir)`));
    return 'no';
  })) {
    if (ev.type === 'text') {
      full += ev.delta;
      if (!opts.json) process.stdout.write(ev.delta);
      lastWasText = true;
    } else if (ev.type === 'tool_start') {
      if (lastWasText && !opts.json) process.stdout.write('\n');
      lastWasText = false;
      err(chalk.hex(colors.lime)('● ') + chalk.bold(ev.name) + chalk.hex(colors.muted)(`(${ev.title})`));
    } else if (ev.type === 'tool_end') {
      err(chalk.hex(ev.isError ? colors.red : colors.muted)(`  ⎿  ${ev.isError ? ev.output.split('\n')[0] : ev.display?.summary ?? 'ok'}`));
      if (!opts.json) full += '\n';
    } else if (ev.type === 'model') {
      err(chalk.hex(colors.muted)(`↻ ${ev.model} (${ev.reason})`));
    } else if (ev.type === 'error') {
      err(chalk.hex(colors.red)(`✗ ${ev.message}`));
      exitCode = 1;
    } else if (ev.type === 'done' && ev.aborted) {
      exitCode = 130;
    }
  }
  if (opts.json) {
    process.stdout.write(JSON.stringify({ result: full.trim(), conversationId: session.conversationId, model: session.model, error: exitCode !== 0 }) + '\n');
  } else if (lastWasText) process.stdout.write('\n');
  return exitCode;
}
