// Cálculos financeiros puros (testados em core/test/finance.test.ts).
// O modelo chama a tool Finance em vez de "fazer conta de cabeça".

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export const fmtBRL = (v: number) => brl.format(v);
export const fmtNum = (v: number) => num.format(v);
export const fmtPct = (v: number) => `${num.format(v * 100)}%`;

const round2 = (v: number) => Math.round(v * 100) / 100;

function assertNumber(name: string, v: unknown, { positive = false, allowZero = true } = {}): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`"${name}" precisa ser um número.`);
  if (positive && (n < 0 || (!allowZero && n === 0))) throw new Error(`"${name}" precisa ser maior que zero.`);
  return n;
}

export interface BreakEven {
  margemContribuicaoUnitaria: number;
  unidades: number;
  unidadesArredondadas: number;
  faturamento: number;
}

/** Ponto de equilíbrio: unidades = custos fixos ÷ (preço − custo variável). */
export function breakEven(custosFixos: number, precoVenda: number, custoVariavel: number): BreakEven {
  const cf = assertNumber('custos_fixos', custosFixos, { positive: true });
  const p = assertNumber('preco_venda', precoVenda, { positive: true, allowZero: false });
  const cv = assertNumber('custo_variavel', custoVariavel, { positive: true });
  const mc = p - cv;
  if (mc <= 0) throw new Error('O preço de venda precisa ser maior que o custo variável; senão cada venda dá prejuízo.');
  const unidades = cf / mc;
  return {
    margemContribuicaoUnitaria: round2(mc),
    unidades: round2(unidades),
    unidadesArredondadas: Math.ceil(unidades - 1e-9),
    faturamento: round2(unidades * p),
  };
}

export interface Margin {
  lucroUnitario: number;
  margem: number; // fração sobre o preço
  markup: number; // fração sobre o custo
}

export function margin(precoVenda: number, custo: number): Margin {
  const p = assertNumber('preco_venda', precoVenda, { positive: true, allowZero: false });
  const c = assertNumber('custo', custo, { positive: true });
  return {
    lucroUnitario: round2(p - c),
    margem: (p - c) / p,
    markup: c > 0 ? (p - c) / c : Infinity,
  };
}

export interface Pricing {
  preco: number;
  lucroUnitario: number;
  markupMultiplicador: number;
}

/**
 * Preço = custo ÷ (1 − margem − impostos − taxas). Percentuais em % (ex.: 30 = 30%).
 */
export function pricing(custoUnitario: number, margemDesejadaPct: number, impostosPct = 0, taxasPct = 0): Pricing {
  const c = assertNumber('custo_unitario', custoUnitario, { positive: true, allowZero: false });
  const m = assertNumber('margem_desejada', margemDesejadaPct, { positive: true }) / 100;
  const i = assertNumber('impostos', impostosPct, { positive: true }) / 100;
  const t = assertNumber('taxas', taxasPct, { positive: true }) / 100;
  const divisor = 1 - m - i - t;
  if (divisor <= 0) throw new Error('Margem + impostos + taxas precisam somar menos de 100%.');
  const preco = c / divisor;
  return {
    preco: round2(preco),
    lucroUnitario: round2(preco * m),
    markupMultiplicador: round2(preco / c),
  };
}

export interface CashMonth {
  mes: number;
  entradas: number;
  saidas: number;
  resultado: number;
  saldo: number;
}

export interface CashFlow {
  meses: CashMonth[];
  saldoFinal: number;
  primeiroMesNegativo: number | null;
  totalEntradas: number;
  totalSaidas: number;
}

export function cashFlow(saldoInicial: number, meses: { entradas: number; saidas: number }[]): CashFlow {
  let saldo = assertNumber('saldo_inicial', saldoInicial);
  if (!Array.isArray(meses) || meses.length === 0) throw new Error('Informe ao menos um mês (entradas e saídas).');
  const out: CashMonth[] = [];
  let primeiroMesNegativo: number | null = null;
  let totalEntradas = 0;
  let totalSaidas = 0;
  meses.forEach((m, idx) => {
    const e = assertNumber(`entradas (mês ${idx + 1})`, m.entradas, { positive: true });
    const s = assertNumber(`saidas (mês ${idx + 1})`, m.saidas, { positive: true });
    saldo += e - s;
    totalEntradas += e;
    totalSaidas += s;
    if (saldo < 0 && primeiroMesNegativo === null) primeiroMesNegativo = idx + 1;
    out.push({ mes: idx + 1, entradas: round2(e), saidas: round2(s), resultado: round2(e - s), saldo: round2(saldo) });
  });
  return { meses: out, saldoFinal: round2(saldo), primeiroMesNegativo, totalEntradas: round2(totalEntradas), totalSaidas: round2(totalSaidas) };
}

/** Gera os meses a partir de valores mensais e crescimento % das entradas. */
export function projectMonths(entradaMensal: number, saidaMensal: number, numeroMeses: number, crescimentoPct = 0) {
  const n = Math.floor(assertNumber('numero_meses', numeroMeses, { positive: true, allowZero: false }));
  if (n > 120) throw new Error('Use no máximo 120 meses.');
  const e0 = assertNumber('entrada_mensal', entradaMensal, { positive: true });
  const s = assertNumber('saida_mensal', saidaMensal, { positive: true });
  const g = assertNumber('crescimento_entradas', crescimentoPct) / 100;
  return Array.from({ length: n }, (_, i) => ({ entradas: e0 * Math.pow(1 + g, i), saidas: s }));
}

export function payback(investimento: number, lucroMensal: number): { meses: number; mesesArredondados: number } {
  const inv = assertNumber('investimento', investimento, { positive: true });
  const l = assertNumber('lucro_mensal', lucroMensal);
  if (l <= 0) throw new Error('Com lucro mensal zero ou negativo o investimento não se paga.');
  const meses = inv / l;
  return { meses: round2(meses), mesesArredondados: Math.ceil(meses - 1e-9) };
}

export interface FinanceInput {
  operacao: 'ponto_equilibrio' | 'margem' | 'precificacao' | 'fluxo_caixa' | 'payback';
  custos_fixos?: number;
  preco_venda?: number;
  custo_variavel?: number;
  custo?: number;
  custo_unitario?: number;
  margem_desejada?: number;
  impostos?: number;
  taxas?: number;
  saldo_inicial?: number;
  meses?: { entradas: number; saidas: number }[];
  entrada_mensal?: number;
  saida_mensal?: number;
  numero_meses?: number;
  crescimento_entradas?: number;
  investimento?: number;
  lucro_mensal?: number;
}

/** Executa a operação e devolve texto com a conta aberta (em pt-BR). */
export function runFinance(i: FinanceInput): string {
  switch (i.operacao) {
    case 'ponto_equilibrio': {
      const r = breakEven(i.custos_fixos as number, i.preco_venda as number, i.custo_variavel as number);
      return [
        '## Ponto de equilíbrio',
        `- Margem de contribuição por unidade = preço − custo variável = ${fmtBRL(i.preco_venda!)} − ${fmtBRL(i.custo_variavel!)} = **${fmtBRL(r.margemContribuicaoUnitaria)}**`,
        `- Unidades = custos fixos ÷ margem = ${fmtBRL(i.custos_fixos!)} ÷ ${fmtBRL(r.margemContribuicaoUnitaria)} = ${fmtNum(r.unidades)} → **${r.unidadesArredondadas} unidades/mês**`,
        `- Faturamento de equilíbrio = ${fmtNum(r.unidades)} × ${fmtBRL(i.preco_venda!)} = **${fmtBRL(r.faturamento)}/mês**`,
        'Abaixo disso há prejuízo; acima, lucro (considerando só os custos informados).',
      ].join('\n');
    }
    case 'margem': {
      const r = margin(i.preco_venda as number, i.custo as number);
      return [
        '## Margem',
        `- Lucro por unidade = ${fmtBRL(i.preco_venda!)} − ${fmtBRL(i.custo!)} = **${fmtBRL(r.lucroUnitario)}**`,
        `- Margem sobre o preço = ${fmtBRL(r.lucroUnitario)} ÷ ${fmtBRL(i.preco_venda!)} = **${fmtPct(r.margem)}**`,
        `- Markup sobre o custo = ${fmtBRL(r.lucroUnitario)} ÷ ${fmtBRL(i.custo!)} = **${Number.isFinite(r.markup) ? fmtPct(r.markup) : '∞'}**`,
      ].join('\n');
    }
    case 'precificacao': {
      const imp = i.impostos ?? 0;
      const tax = i.taxas ?? 0;
      const r = pricing(i.custo_unitario as number, i.margem_desejada as number, imp, tax);
      return [
        '## Precificação',
        `- Preço = custo ÷ (1 − margem − impostos − taxas) = ${fmtBRL(i.custo_unitario!)} ÷ (1 − ${fmtNum(i.margem_desejada!)}% − ${fmtNum(imp)}% − ${fmtNum(tax)}%) = **${fmtBRL(r.preco)}**`,
        `- Lucro por unidade (margem de ${fmtNum(i.margem_desejada!)}% sobre o preço) = **${fmtBRL(r.lucroUnitario)}**`,
        `- Multiplicador sobre o custo (markup) = **${fmtNum(r.markupMultiplicador)}×**`,
        'Compare com o preço da concorrência antes de decidir.',
      ].join('\n');
    }
    case 'fluxo_caixa': {
      const meses =
        i.meses && i.meses.length > 0
          ? i.meses
          : projectMonths(i.entrada_mensal as number, i.saida_mensal as number, i.numero_meses as number, i.crescimento_entradas ?? 0);
      const r = cashFlow(i.saldo_inicial ?? 0, meses);
      const rows = r.meses.map((m) => `| ${m.mes} | ${fmtBRL(m.entradas)} | ${fmtBRL(m.saidas)} | ${fmtBRL(m.resultado)} | ${fmtBRL(m.saldo)} |`);
      return [
        '## Fluxo de caixa',
        `Saldo inicial: ${fmtBRL(i.saldo_inicial ?? 0)}`,
        '',
        '| Mês | Entradas | Saídas | Resultado | Saldo |',
        '|---|---|---|---|---|',
        ...rows,
        '',
        `- Total de entradas: ${fmtBRL(r.totalEntradas)} · Total de saídas: ${fmtBRL(r.totalSaidas)}`,
        `- **Saldo final: ${fmtBRL(r.saldoFinal)}**`,
        r.primeiroMesNegativo
          ? `- ⚠️ O caixa fica negativo no mês ${r.primeiroMesNegativo}: será preciso capital de giro.`
          : '- O caixa não fica negativo no período.',
      ].join('\n');
    }
    case 'payback': {
      const r = payback(i.investimento as number, i.lucro_mensal as number);
      return [
        '## Payback (retorno do investimento)',
        `- Meses = investimento ÷ lucro mensal = ${fmtBRL(i.investimento!)} ÷ ${fmtBRL(i.lucro_mensal!)} = ${fmtNum(r.meses)} → **cerca de ${r.mesesArredondados} meses**`,
        'É uma estimativa simples (não considera juros nem variação do lucro).',
      ].join('\n');
    }
    default:
      throw new Error('Operação desconhecida. Use: ponto_equilibrio, margem, precificacao, fluxo_caixa ou payback.');
  }
}
