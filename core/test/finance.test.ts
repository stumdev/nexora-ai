import { describe, expect, it } from 'vitest';
import { breakEven, cashFlow, margin, payback, pricing, projectMonths, runFinance } from '../src/finance';
import { FinanceTool } from '../src/tools/business';

describe('Finance', () => {
  it('calcula o ponto de equilíbrio', () => {
    // custos fixos 3.000, preço 30, custo variável 12 → MC 18 → 166,67 un.
    const r = breakEven(3000, 30, 12);
    expect(r.margemContribuicaoUnitaria).toBe(18);
    expect(r.unidades).toBeCloseTo(166.67, 2);
    expect(r.unidadesArredondadas).toBe(167);
    expect(r.faturamento).toBeCloseTo(5000, 2);
  });

  it('rejeita preço menor que o custo variável', () => {
    expect(() => breakEven(1000, 10, 12)).toThrow(/maior que o custo variável/);
  });

  it('calcula margem e markup', () => {
    const r = margin(50, 20);
    expect(r.lucroUnitario).toBe(30);
    expect(r.margem).toBeCloseTo(0.6);
    expect(r.markup).toBeCloseTo(1.5);
  });

  it('precifica pelo método do divisor', () => {
    // 20 / (1 - 0,30 - 0,06 - 0,04) = 20 / 0,6 = 33,33
    const r = pricing(20, 30, 6, 4);
    expect(r.preco).toBeCloseTo(33.33, 2);
    expect(r.lucroUnitario).toBeCloseTo(10, 2);
    expect(() => pricing(20, 80, 20, 10)).toThrow();
  });

  it('projeta fluxo de caixa e detecta saldo negativo', () => {
    const r = cashFlow(1000, [
      { entradas: 500, saidas: 1200 },
      { entradas: 500, saidas: 1200 },
      { entradas: 3000, saidas: 1200 },
    ]);
    expect(r.meses.map((m) => m.saldo)).toEqual([300, -400, 1400]);
    expect(r.primeiroMesNegativo).toBe(2);
    expect(r.saldoFinal).toBe(1400);
  });

  it('gera meses com crescimento', () => {
    const meses = projectMonths(1000, 800, 3, 10);
    expect(meses.map((m) => Math.round(m.entradas))).toEqual([1000, 1100, 1210]);
  });

  it('calcula payback', () => {
    expect(payback(10000, 1500)).toEqual({ meses: 6.67, mesesArredondados: 7 });
    expect(() => payback(10000, 0)).toThrow();
  });

  it('runFinance devolve a conta aberta em pt-BR', () => {
    const out = runFinance({ operacao: 'ponto_equilibrio', custos_fixos: 3000, preco_venda: 30, custo_variavel: 12 });
    expect(out).toContain('167 unidades/mês');
    expect(out).toMatch(/R\$\s?5\.000,00/);
  });

  it('a tool Finance devolve erro amigável com dados inválidos', async () => {
    const ctx = { cwd: process.cwd(), signal: new AbortController().signal, emit: () => {} };
    const r = await FinanceTool.run({ operacao: 'margem', preco_venda: 0, custo: 5 }, ctx);
    expect(r.isError).toBe(true);
    expect(r.output).toMatch(/Não foi possível calcular/);
  });
});
