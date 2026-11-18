// Servidor falso compatível com a API da Groq (OpenAI) para testes de ponta a ponta.
import http from 'node:http';

const port = Number(process.argv[2] || 4999);
const sse = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', async () => {
      if (req.url.endsWith('/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: 'mock' }] }));
      }
      const data = JSON.parse(body);
      const msgs = data.messages;
      const last = msgs[msgs.length - 1];
      const firstUser = msgs.find((m) => m.role === 'user')?.content ?? '';
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const toolRound = msgs.filter((m) => m.role === 'tool').length;
      const wantsPoster = /cartaz/i.test(firstUser);
      const wantsFile = /arquivo/i.test(firstUser);
      if (last.role === 'user' && (wantsPoster || wantsFile || /financeiro|equil/i.test(firstUser))) {
        const call = wantsPoster
          ? { name: 'Poster', arguments: JSON.stringify({ marca: 'Urban Burger', chamada: 'Sabor artesanal de verdade', slogan: 'Do pão ao molho, tudo feito aqui.', beneficios: ['Pão de fermentação natural', 'Blend próprio', 'Molhos da casa'], convite: 'Conheça o Urban Burger' }) }
          : wantsFile
            ? { name: 'Write', arguments: JSON.stringify({ path: 'plano-teste.md', content: '# Plano\n\n- item 1\n' }) }
            : { name: 'Finance', arguments: JSON.stringify({ operacao: 'ponto_equilibrio', custos_fixos: 3000, preco_venda: 30, custo_variavel: 12 }) };
        sse(res, { choices: [{ delta: { role: 'assistant', content: 'Vou calcular isso.' } }] });
        sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: call.name, arguments: '' } }] } }] });
        sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: call.arguments } }] } }] });
        sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }], x_groq: { usage: { prompt_tokens: 10, completion_tokens: 20 } } });
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      const text = `## Plano inicial\n\nOlá! Recebi: **${String(firstUser).slice(0, 40)}**.\n\n- **Público-alvo:** mulheres de 20 a 35 anos que compram pelo Instagram.\n- **Custos iniciais:** estoque, fotos, site e embalagens.\n- **Divulgação:** conteúdo diário, parcerias com microinfluenciadoras e WhatsApp.\n- **Nomes:** Vitrine Viva, Closet Leve, Moda Rota.\n- **Vendas:** frete grátis acima de um valor mínimo e kits de looks.\n\n| Item | Valor |\n|---|---|\n| Estoque | R$ 2.000 (estimativa) |\n\n### Revise antes de usar\n- Confira os custos.${toolRound ? `\n\n(resultado de ${toolRound} ferramenta(s) recebido)` : ''}`;
      for (const piece of text.match(/.{1,12}/gs)) {
        sse(res, { choices: [{ delta: { content: piece } }] });
        await new Promise((r) => setTimeout(r, 15));
      }
      sse(res, { choices: [{ delta: {}, finish_reason: 'stop' }], x_groq: { usage: { prompt_tokens: 10, completion_tokens: 50 } } });
      res.write('data: [DONE]\n\n');
      res.end();
    });
  })
  .listen(port, '127.0.0.1', () => console.log('mock on', port));
