import { describe, expect, it } from 'vitest';
import { layoutBars } from '@/app/(hub)/_lib/bars';

describe('layoutBars', () => {
  const rows = [
    { category: 'Transporte',  total: '320.00', count: 8 },
    { category: 'Alimentação', total: '800.00', count: 21 },
    { category: 'Lazer',       total: '80.00',  count: 2 },
  ];

  it('ordena do maior para o menor, não na ordem que veio', () => {
    expect(layoutBars(rows).bars.map((b) => b.category))
      .toEqual(['Alimentação', 'Transporte', 'Lazer']);
  });

  it('escala pelo MAIOR valor, não pelo total', () => {
    const { bars } = layoutBars(rows);
    // 800 é a maior: 100%. 320/800 = 40%. Escalar pelo total (1200) daria 67% e
    // 27%, encolhendo tudo e apagando a diferença quando há muitas categorias.
    expect(bars[0]!.widthPct).toBe(100);
    expect(bars[1]!.widthPct).toBeCloseTo(40, 5);
  });

  it('calcula participação no total à parte da largura', () => {
    const { bars, total } = layoutBars(rows);
    expect(total).toBe(1200);
    expect(bars[0]!.sharePct).toBeCloseTo(66.67, 1);
  });

  it('dá piso de 2% para barra minúscula não virar invisível', () => {
    const { bars } = layoutBars([
      { category: 'Moradia', total: '5000.00' },
      { category: 'Outros',  total: '1.00' },
    ]);
    // 1/5000 = 0,02% — renderizaria nada, e barra invisível lê como "não existe".
    expect(bars[1]!.widthPct).toBe(2);
  });

  it('descarta categoria sem valor em vez de desenhar barra vazia', () => {
    const { bars } = layoutBars([
      { category: 'Saúde',  total: '0' },
      { category: 'Compras', total: '50' },
    ]);
    expect(bars.map((b) => b.category)).toEqual(['Compras']);
  });

  it('lista vazia não quebra a divisão por zero', () => {
    const r = layoutBars([]);
    expect(r.bars).toEqual([]);
    expect(r.max).toBe(0);
    expect(r.total).toBe(0);
  });

  it('aceita total como número e como string', () => {
    const { bars } = layoutBars([{ category: 'Lazer', total: 100 }]);
    expect(bars[0]!.value).toBe(100);
  });
});
