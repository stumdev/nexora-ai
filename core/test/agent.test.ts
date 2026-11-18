import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAgent, type AgentOptions } from '../src/agent';
import { ProviderError, type Provider, type ProviderEvent, type StreamRequest } from '../src/provider';
import { PermissionManager } from '../src/permissions';
import { defaultTools } from '../src/tools/index';
import { applyEdit } from '../src/tools/files';
import { Store, toHistory } from '../src/db';
import { loadSkills, resolveSkillInput } from '../src/skills';
import { buildPosterSvg } from '../src/poster';
import type { AgentEvent, ChatMessage } from '../src/types';

/** Provider falso: cada chamada consome o próximo "roteiro". */
class FakeProvider implements Provider {
  calls: StreamRequest[] = [];
  constructor(private scripts: (ProviderEvent[] | Error | ((req: StreamRequest) => AsyncGenerator<ProviderEvent>))[]) {}
  async *stream(req: StreamRequest): AsyncGenerator<ProviderEvent> {
    this.calls.push(req);
    const s = this.scripts.shift();
    if (!s) throw new Error('roteiro acabou');
    if (s instanceof Error) throw s;
    if (typeof s === 'function') {
      yield* s(req);
      return;
    }
    for (const ev of s) yield ev;
  }
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-test-'));
}

function opts(provider: Provider, extra: Partial<AgentOptions> = {}): AgentOptions {
  return {
    provider,
    models: ['modelo-a', 'modelo-b'],
    tools: defaultTools(),
    systemPrompt: 'teste',
    cwd: tmpDir(),
    signal: new AbortController().signal,
    permissions: new PermissionManager(),
    askPermission: async () => 'yes',
    retryDelayMs: 0,
    ...extra,
  };
}

async function collect(gen: AsyncGenerator<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const user = (content: string): ChatMessage[] => [{ role: 'user', content }];

describe('loop do agente', () => {
  it('responde texto em streaming sem ferramentas', async () => {
    const p = new FakeProvider([[{ type: 'text', delta: 'Olá, ' }, { type: 'text', delta: 'empreendedor!' }]]);
    const events = await collect(runAgent(user('oi'), opts(p)));
    const text = events.filter((e) => e.type === 'text').map((e: any) => e.delta).join('');
    expect(text).toBe('Olá, empreendedor!');
    expect(events.at(-1)).toEqual({ type: 'done', aborted: false });
    expect(p.calls[0].messages[0].role).toBe('system');
  });

  it('executa a tool Finance e continua até a resposta final', async () => {
    const p = new FakeProvider([
      [
        {
          type: 'tool_calls',
          calls: [{ id: 'c1', name: 'Finance', arguments: JSON.stringify({ operacao: 'ponto_equilibrio', custos_fixos: 3000, preco_venda: 30, custo_variavel: 12 }) }],
        },
      ],
      [{ type: 'text', delta: 'Você precisa vender 167 unidades.' }],
    ]);
    const events = await collect(runAgent(user('ponto de equilíbrio?'), opts(p)));
    const end = events.find((e) => e.type === 'tool_end') as any;
    expect(end.isError).toBe(false);
    expect(end.output).toContain('167 unidades/mês');
    // a segunda chamada ao modelo recebe o resultado da ferramenta
    const second = p.calls[1].messages;
    expect(second.at(-1)?.role).toBe('tool');
    expect(second.at(-2)?.toolCalls?.[0].name).toBe('Finance');
    const msgs = events.filter((e) => e.type === 'message');
    expect(msgs).toHaveLength(3); // assistant(tool call) + tool + assistant final
  });

  it('pede permissão para Write e respeita "Não"', async () => {
    const asked: string[] = [];
    const p = new FakeProvider([
      [{ type: 'tool_calls', calls: [{ id: 'w1', name: 'Write', arguments: JSON.stringify({ path: 'plano.md', content: '# Plano' }) }] }],
      [{ type: 'text', delta: 'Ok, não criei.' }],
    ]);
    const o = opts(p, {
      askPermission: async (r) => {
        asked.push(r.tool);
        expect(r.diff).toContain('+# Plano');
        return 'no';
      },
    });
    const events = await collect(runAgent(user('crie plano.md'), o));
    expect(asked).toEqual(['Write']);
    expect(fs.existsSync(path.join(o.cwd, 'plano.md'))).toBe(false);
    expect((events.find((e) => e.type === 'tool_end') as any).isError).toBe(true);
  });

  it('"Sim, não perguntar de novo" vale para a sessão', async () => {
    let asked = 0;
    const write = (id: string, file: string) => [{ type: 'tool_calls' as const, calls: [{ id, name: 'Write', arguments: JSON.stringify({ path: file, content: 'x' }) }] }];
    const p = new FakeProvider([write('a', 'a.md'), write('b', 'b.md'), [{ type: 'text', delta: 'pronto' }]]);
    const o = opts(p, { askPermission: async () => (asked++, 'always') });
    await collect(runAgent(user('crie'), o));
    expect(asked).toBe(1);
    expect(fs.existsSync(path.join(o.cwd, 'a.md')) && fs.existsSync(path.join(o.cwd, 'b.md'))).toBe(true);
  });

  it('faz fallback para o próximo modelo em erro 429', async () => {
    const p = new FakeProvider([new ProviderError('rate limit', 429), [{ type: 'text', delta: 'ok' }]]);
    const events = await collect(runAgent(user('oi'), opts(p)));
    expect(p.calls.map((c) => c.model)).toEqual(['modelo-a', 'modelo-b']);
    expect(events.find((e) => e.type === 'model')).toMatchObject({ model: 'modelo-b' });
    expect(events.at(-1)).toEqual({ type: 'done', aborted: false });
  });

  it('mostra erro amigável quando todos os modelos falham', async () => {
    const err = () => new ProviderError('rate limit', 429);
    const p = new FakeProvider([err(), err(), err(), err()]);
    const events = await collect(runAgent(user('oi'), opts(p)));
    expect((events.find((e) => e.type === 'error') as any).message).toMatch(/Limite gratuito/);
  });

  it('cancela no meio do streaming', async () => {
    const ac = new AbortController();
    const p = new FakeProvider([
      async function* () {
        yield { type: 'text', delta: 'começo ' } as ProviderEvent;
        ac.abort();
        yield { type: 'text', delta: 'nunca' } as ProviderEvent;
      },
    ]);
    const events = await collect(runAgent(user('oi'), opts(p, { signal: ac.signal })));
    expect(events.at(-1)).toEqual({ type: 'done', aborted: true });
    expect(events.filter((e) => e.type === 'text')).toHaveLength(1);
  });

  it('trata JSON inválido e ferramenta desconhecida como erro de ferramenta', async () => {
    const p = new FakeProvider([
      [{ type: 'tool_calls', calls: [{ id: 'x', name: 'Finance', arguments: '{quebrado' }, { id: 'y', name: 'Nada', arguments: '{}' }] }],
      [{ type: 'text', delta: 'desculpe' }],
    ]);
    const events = await collect(runAgent(user('oi'), opts(p)));
    const ends = events.filter((e) => e.type === 'tool_end') as any[];
    expect(ends.map((e) => e.isError)).toEqual([true, true]);
  });
});

describe('Edit', () => {
  it('substitui trecho único', () => {
    expect(applyEdit('a b c', 'b', 'B')).toBe('a B c');
  });
  it('erro quando ausente ou ambíguo', () => {
    expect(() => applyEdit('a b', 'z', 'Z')).toThrow(/não encontrado/);
    expect(() => applyEdit('a a', 'a', 'b')).toThrow(/2 vezes/);
    expect(applyEdit('a a', 'a', 'b', true)).toBe('b b');
  });
});

describe('banco e skills', () => {
  it('salva e lê conversas', () => {
    const store = new Store(':memory:');
    const c = store.createConversation('Teste', 'cli');
    store.addMessage(c.id, { role: 'user', content: 'oi' });
    store.addMessage(c.id, { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'Read', arguments: '{}' }] });
    const hist = toHistory(store.getMessages(c.id));
    // chamada sem resultado é descartada para manter o histórico válido
    expect(hist).toEqual([{ role: 'user', content: 'oi' }]);
    expect(store.findConversation(c.id.slice(0, 8))?.id).toBe(c.id);
    store.close();
  });

  it('carrega skills e expande $ARGUMENTS', () => {
    const skills = loadSkills();
    const names = skills.map((s) => s.name);
    for (const n of ['ideia', 'plano', 'publico', 'nomes', 'marketing', 'post', 'financeiro', 'metas', 'melhorar', 'comparar', 'cartaz', 'demo']) {
      expect(names).toContain(n);
    }
    const r = resolveSkillInput('/plano loja de roupas online', skills);
    expect(r.skill?.name).toBe('plano');
    expect(r.prompt).toContain('loja de roupas online');
    expect(r.prompt).toContain('Revise antes de usar');
  });

  it('gera SVG do cartaz 4:5 com as cores da marca', () => {
    const svg = buildPosterSvg({ marca: 'Urban Burger', chamada: 'Sabor artesanal de verdade', beneficios: ['Pão de fermentação natural'], convite: 'Peça já' });
    expect(svg).toContain('width="1080" height="1350"');
    expect(svg).toContain('#B7F34A');
    expect(svg).toContain('URBAN BURGER');
  });
});
