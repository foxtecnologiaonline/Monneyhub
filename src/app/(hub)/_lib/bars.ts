/**
 * Ordenação e escala do gráfico de gastos por categoria. Puro, sem React —
 * errar a escala é silencioso, então a matemática fica testável à parte.
 *
 * A forma é barra horizontal ordenada, não rosca nem pizza: o trabalho do leitor
 * ali é comparar magnitude ("em que eu gasto mais?"), e comparar comprimento é
 * mais fácil que comparar ângulo. Com dez categorias, um círculo fatiado também
 * estouraria qualquer paleta legível.
 *
 * Uma hue só para todas as barras: o comprimento já codifica a magnitude, e cor
 * não precisa repetir a informação. Dez cores categóricas seriam indistinguíveis
 * sob daltonismo e pintariam de identidade algo que é só tamanho.
 *
 * As barras são desenhadas em CSS (largura em %, ponta direita arredondada,
 * esquerda reta na linha de base) e não em SVG: assim acompanham a largura do
 * celular sem medir container, e o rótulo não escala junto com o desenho.
 */

export interface BarRow {
  category: string;
  total: string | number;
  count?: number;
}

export interface LaidOutBar {
  category: string;
  value: number;
  count: number;
  /** 0..100 — largura em % da maior barra, pronta para o CSS */
  widthPct: number;
  /** participação no total do mês, só para o texto de apoio */
  sharePct: number;
}

export interface BarLayout {
  bars: LaidOutBar[];
  max: number;
  total: number;
}

/**
 * Ordena por valor (maior primeiro) e calcula a largura relativa de cada barra.
 *
 * A escala é relativa ao MAIOR valor, não ao total: a pergunta é comparativa
 * ("qual categoria pesa mais"), e escalar pelo total encolheria todas as barras
 * ao ponto de nenhuma diferença aparecer quando há muitas categorias.
 */
export function layoutBars(rows: BarRow[]): BarLayout {
  const parsed = rows
    .map((r) => ({
      category: r.category,
      value:    Number(r.total) || 0,
      count:    r.count ?? 0,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  const max   = parsed.reduce((m, r) => Math.max(m, r.value), 0);
  const total = parsed.reduce((s, r) => s + r.value, 0);

  const bars: LaidOutBar[] = parsed.map((r) => ({
    ...r,
    // Piso de 2%: uma categoria de R$ 1 ao lado de uma de R$ 5.000 renderizaria
    // uma barra invisível, e barra invisível lê como "não existe".
    widthPct: max > 0 ? Math.max(2, (r.value / max) * 100) : 0,
    sharePct: total > 0 ? (r.value / total) * 100 : 0,
  }));

  return { bars, max, total };
}
