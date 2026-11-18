import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { Store, type Provider, type ProviderEvent, type StreamRequest } from '@nexora/core';
import { App } from '../src/App';
import { renderMarkdown } from '../src/markdown';

class FakeProvider implements Provider {
  async *stream(req: StreamRequest): AsyncGenerator<ProviderEvent> {
    const last = req.messages[req.messages.length - 1];
    if (last.role === 'user' && /arquivo/.test(last.content)) {
      yield { type: 'tool_calls', calls: [{ id: 'w1', name: 'Write', arguments: JSON.stringify({ path: 'plano.md', content: '# Plano\nlinha' }) }] };
      return;
    }
    yield { type: 'text', delta: '## Resposta\n\n- item **forte**\n' };
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, timeout = 3000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('timeout; tela:\n' + lastFrameForDebug());
    await wait(20);
  }
}
let lastFrameForDebug = () => '';
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('CLI (Ink)', () => {
  let home: string;
  let cwd: string;
  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-cli-home-'));
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-cli-cwd-'));
    process.env.NEXORA_HOME = home;
    process.env.GROQ_API_KEY = 'teste';
  });
  afterAll(() => {
    delete process.env.GROQ_API_KEY;
  });

  it('mostra banner, responde em streaming e pede permissão com diff', async () => {
    const store = new Store(':memory:');
    const app = render(<App store={store} cwd={cwd} provider={new FakeProvider()} />);
    const frame = () => strip(app.lastFrame() ?? '');
    lastFrameForDebug = frame;
    expect(frame()).toContain('Bem-vindo à Nexora AI!');
    expect(frame()).toContain('Da ideia ao negócio, com inteligência.');

    await wait(400); // espera o Ink ligar a leitura do teclado
    // menu de comandos ao digitar "/"
    app.stdin.write('/pla');
    await until(() => /\/plano\s+Plano de negócio/.test(frame()));
    app.stdin.write('\u001b'); // Esc limpa
    await until(() => frame().includes('digite / para ver os comandos'));

    for (const ch of 'oi') app.stdin.write(ch);
    await wait(30);
    app.stdin.write('\r');
    await until(() => frame().includes('Resposta'));
    expect(frame()).toContain('forte');
    expect(frame()).not.toContain('**forte**');

    for (const ch of 'crie um arquivo') app.stdin.write(ch);
    await wait(30);
    app.stdin.write('\r');
    await until(() => frame().includes('Você permite esta ação?'));
    expect(frame()).toContain('Sim, não perguntar de novo nesta sessão');
    expect(frame()).toContain('# Plano');
    app.stdin.write('1');
    await until(() => frame().includes('Criou plano.md'));
    expect(fs.readFileSync(path.join(cwd, 'plano.md'), 'utf8')).toContain('# Plano');
    app.unmount();
    store.close();
  });

  it('renderiza markdown com negrito dentro de listas', () => {
    const out = strip(renderMarkdown('- item **forte**\n\n| A | B |\n|---|---|\n| 1 | 2 |', 80));
    expect(out).toContain('item forte');
    expect(out).toContain('│');
  });
});
