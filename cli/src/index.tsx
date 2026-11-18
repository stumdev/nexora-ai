import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import chalk from 'chalk';
import { Store, VERSION, findUp } from '@nexora/core';
import { startServer } from '@nexora/server';
import { App } from './App';
import { runPrint } from './print';
import { colors } from './theme';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (data += d));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

/**
 * No Git Bash (Windows), "/plano" vira "C:/Program Files/Git/plano" antes de chegar ao Node.
 * Desfaz essa conversão para os comandos de negócio funcionarem também lá.
 */
function fixMsysSlash(text: string): string {
  if (!process.env.MSYSTEM) return text;
  const m = /^[A-Za-z]:[\\/](?:[^\\/]+[\\/])*?Git[\\/]([\w-]+)(?=\s|$)/.exec(text);
  return m ? `/${m[1]}${text.slice(m[0].length)}` : text;
}

function openBrowser(url: string) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref();
  } catch {
    /* sem navegador */
  }
}

function webDir(): string | undefined {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return findUp(path.join('web', 'dist'), undefined, here);
}

function openStore(): Store {
  try {
    return new Store();
  } catch (err) {
    console.error(chalk.hex(colors.red)(`✗ Não foi possível abrir o banco em ~/.nexora: ${(err as Error).message}`));
    process.exit(1);
  }
}

const program = new Command();
program
  .name('nexora')
  .description('Nexora AI — Da ideia ao negócio, com inteligência.')
  .version(VERSION, '-v, --version', 'mostra a versão')
  .argument('[prompt...]', 'pergunta inicial')
  .option('-p, --print', 'modo não interativo: responde e sai')
  .option('-c, --continue', 'continua a última conversa')
  .option('-m, --model <modelo>', 'modelo da Groq a usar')
  .option('-y, --yes', 'no modo -p, permite Write/Edit/Bash sem perguntar')
  .option('--json', 'no modo -p, imprime o resultado em JSON')
  .helpOption('-h, --help', 'mostra a ajuda')
  .action(async (words: string[], opts: { print?: boolean; continue?: boolean; model?: string; yes?: boolean; json?: boolean }) => {
    const cwd = process.cwd();
    let prompt = fixMsysSlash(words.join(' ').trim());
    if (opts.print) {
      const stdin = await readStdin();
      if (stdin.trim()) prompt = prompt ? `${prompt}\n\n${stdin.trim()}` : stdin.trim();
      if (!prompt) {
        console.error('Uso: nexora -p "sua pergunta"');
        process.exit(1);
      }
      const store = openStore();
      const code = await runPrint(prompt, { store, cwd, yes: opts.yes, model: opts.model, json: opts.json });
      store.close();
      process.exit(code);
    }
    if (!process.stdin.isTTY) {
      console.error('O modo interativo precisa de um terminal. Use: nexora -p "pergunta"');
      process.exit(1);
    }
    const store = openStore();
    // Como o Claude Code: limpa o terminal (tela + histórico de rolagem) antes de mostrar o banner.
    if (!process.env.NEXORA_NO_CLEAR) process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
    const app = render(<App store={store} cwd={cwd} initialPrompt={prompt || undefined} continueLast={opts.continue} model={opts.model} />, {
      exitOnCtrlC: false,
    });
    await app.waitUntilExit();
    store.close();
    process.exit(0);
  });

program
  .command('web')
  .description('abre a versão web no navegador (http://localhost:4173)')
  .option('--port <porta>', 'porta', '4173')
  .option('--no-open', 'não abre o navegador')
  .action(async (opts: { port: string; open: boolean }) => {
    const dir = webDir();
    if (!dir) console.error(chalk.yellow('Aviso: build da web não encontrado. Rode "pnpm build" na pasta do projeto.'));
    try {
      const { url } = await startServer({ port: Number(opts.port) || 4173, cwd: process.cwd(), webDir: dir });
      console.log(`${chalk.hex(colors.lime)('●')} ${chalk.bold('Nexora AI (web)')} rodando em ${chalk.hex(colors.lime).underline(url)}`);
      console.log(chalk.hex(colors.muted)(`  pasta: ${process.cwd()} · só acessível neste computador · Ctrl+C para parar`));
      if (opts.open) openBrowser(url);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      console.error(
        chalk.hex(colors.red)(e.code === 'EADDRINUSE' ? `✗ A porta ${opts.port} já está em uso. Use --port 4174.` : `✗ Erro ao iniciar: ${e.message}`),
      );
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.hex(colors.red)(`✗ ${(err as Error).message}`));
  if (process.env.NEXORA_DEBUG) console.error(err);
  process.exit(1);
});
