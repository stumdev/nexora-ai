import path from 'node:path';
import type { Tool } from './types';
import { runFinance, type FinanceInput } from '../finance';
import { savePoster, type PosterInput } from '../poster';
import { displayPath } from './files';

const OPS_LABEL: Record<string, string> = {
  ponto_equilibrio: 'ponto de equilíbrio',
  margem: 'margem',
  precificacao: 'precificação',
  fluxo_caixa: 'fluxo de caixa',
  payback: 'payback',
};

export const FinanceTool: Tool<FinanceInput> = {
  name: 'Finance',
  description:
    'Calculadora financeira para pequenos negócios. SEMPRE use esta ferramenta em vez de calcular de cabeça. ' +
    'Operações e parâmetros: ' +
    'ponto_equilibrio (custos_fixos, preco_venda, custo_variavel); ' +
    'margem (preco_venda, custo); ' +
    'precificacao (custo_unitario, margem_desejada em %, impostos em % opcional, taxas em % opcional); ' +
    'fluxo_caixa (saldo_inicial e meses=[{entradas, saidas}] OU entrada_mensal, saida_mensal, numero_meses, crescimento_entradas em %); ' +
    'payback (investimento, lucro_mensal). Valores em reais (número, sem "R$").',
  parameters: {
    type: 'object',
    properties: {
      operacao: { type: 'string', enum: ['ponto_equilibrio', 'margem', 'precificacao', 'fluxo_caixa', 'payback'] },
      custos_fixos: { type: 'number' },
      preco_venda: { type: 'number' },
      custo_variavel: { type: 'number' },
      custo: { type: 'number' },
      custo_unitario: { type: 'number' },
      margem_desejada: { type: 'number', description: 'Percentual, ex.: 30' },
      impostos: { type: 'number', description: 'Percentual, ex.: 6' },
      taxas: { type: 'number', description: 'Percentual, ex.: 5 (cartão, marketplace)' },
      saldo_inicial: { type: 'number' },
      meses: {
        type: 'array',
        items: { type: 'object', properties: { entradas: { type: 'number' }, saidas: { type: 'number' } }, required: ['entradas', 'saidas'] },
      },
      entrada_mensal: { type: 'number' },
      saida_mensal: { type: 'number' },
      numero_meses: { type: 'number' },
      crescimento_entradas: { type: 'number', description: 'Percentual ao mês, ex.: 5' },
      investimento: { type: 'number' },
      lucro_mensal: { type: 'number' },
    },
    required: ['operacao'],
  },
  title: (i) => OPS_LABEL[i.operacao] ?? String(i.operacao),
  async run(input) {
    try {
      const out = runFinance(input);
      return { output: out, display: { summary: `Calculou ${OPS_LABEL[input.operacao] ?? input.operacao}` } };
    } catch (err) {
      return { output: `Não foi possível calcular: ${(err as Error).message}`, isError: true };
    }
  },
};

export const PosterTool: Tool<PosterInput> = {
  name: 'Poster',
  description:
    'Transforma um texto de divulgação em um CARTAZ vertical 4:5 (estilo grafite + branco + verde-lima, com ilustração). ' +
    'Salva SVG, HTML e PNG em ./nexora-docs/. Use frases curtas: chamada (até ~8 palavras), slogan, 3 benefícios curtos, ' +
    'convite (ex.: "Conheça a Nexora AI") e rodapé discreto. Não prometa resultados.',
  parameters: {
    type: 'object',
    properties: {
      marca: { type: 'string', description: 'Nome da marca no topo' },
      chamada: { type: 'string', description: 'Frase principal, grande' },
      slogan: { type: 'string' },
      beneficios: { type: 'array', items: { type: 'string' }, description: 'Até 3 benefícios curtos' },
      convite: { type: 'string', description: 'Chamada para ação curta' },
      rodape: { type: 'string', description: 'Texto pequeno de rodapé' },
      arquivo: { type: 'string', description: 'Nome base dos arquivos (opcional)' },
    },
    required: ['chamada'],
  },
  title: (i) => i.marca || i.chamada || 'cartaz',
  async run(input, ctx) {
    if (!input.chamada) return { output: 'Parâmetro "chamada" é obrigatório.', isError: true };
    const { svg, files } = await savePoster(input, ctx.cwd);
    const rel = files.map((f) => displayPath(ctx.cwd, f).replace(/\\/g, '/'));
    const artifact = {
      id: `poster-${Date.now()}`,
      title: `Cartaz — ${input.marca || input.chamada}`,
      kind: 'svg' as const,
      content: svg,
      files: rel,
    };
    ctx.emit({ type: 'artifact', artifact });
    const hasPng = files.some((f) => path.extname(f) === '.png');
    return {
      output: `Cartaz gerado e salvo em: ${rel.join(', ')}${hasPng ? '' : ' (PNG indisponível neste sistema; use o botão de download da web)'}.`,
      display: { summary: `Salvou ${rel.join(', ')}`, artifact },
    };
  },
};
