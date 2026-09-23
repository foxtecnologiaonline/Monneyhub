/**
 * Lógica pura do MEI-Oráculo: converte a previsão de fluxo diário do Amazon
 * Forecast em série de saldo, acha o cruzamento de zero e mede o erro.
 * Sem I/O aqui de propósito — é o pedaço que precisa ser testável sem AWS.
 */

/** Histórico mínimo pra treinar; abaixo disso o usuário fica "aguardando dado suficiente". */
export const MIN_HISTORY_MONTHS = 6;
/** Horizonte máximo previsto. */
export const FORECAST_HORIZON_DAYS = 90;
/** Horizontes expostos ao usuário. */
export const HORIZONS_DAYS = [30, 60, 90] as const;
/** Janela do alerta proativo de saldo negativo. */
export const ALERT_WINDOW_DAYS = 30;
/** Antecedência mínima exigida pelo critério de aceite. */
export const MIN_ALERT_LEAD_DAYS = 15;

export interface DailyFlowQuantiles {
  /** ISO date (AAAA-MM-DD) */
  date: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface BalancePoint {
  date: string;
  p10: number;
  p50: number;
  p90: number;
}

/**
 * Saldo previsto = saldo de abertura + soma acumulada do fluxo diário previsto.
 *
 * Ressalva honesta: somar o P10 diário não produz o P10 estatístico do saldo
 * acumulado (os erros diários não são perfeitamente correlacionados). É a
 * aproximação usual e serve ao propósito da faixa — comunicar incerteza como
 * cenário pessimista/realista/otimista, não cravar percentil exato.
 */
export function toBalanceSeries(
  openingBalance: number,
  flows: DailyFlowQuantiles[],
): BalancePoint[] {
  const ordered = [...flows].sort((a, b) => a.date.localeCompare(b.date));

  let p10 = openingBalance;
  let p50 = openingBalance;
  let p90 = openingBalance;

  return ordered.map((flow) => {
    p10 += flow.p10;
    p50 += flow.p50;
    p90 += flow.p90;
    return { date: flow.date, p10, p50, p90 };
  });
}

/**
 * Faixa no horizonte pedido. A série é diária e 1-indexada a partir do
 * primeiro dia previsto, então o dia 30 é o 30º ponto.
 */
export function bandAtHorizon(series: BalancePoint[], horizonDays: number): BalancePoint | null {
  return series[horizonDays - 1] ?? null;
}

export function bandsAtHorizons(
  series: BalancePoint[],
  horizons: readonly number[] = HORIZONS_DAYS,
): Array<{ horizonDays: number; band: BalancePoint | null }> {
  return horizons.map((horizonDays) => ({
    horizonDays,
    band: bandAtHorizon(series, horizonDays),
  }));
}

/**
 * Primeiro dia em que o cenário realista (P50) fica negativo dentro da janela.
 * É o gatilho do alerta proativo de saldo negativo.
 */
export function firstNegativeP50(
  series: BalancePoint[],
  withinDays: number = ALERT_WINDOW_DAYS,
): { point: BalancePoint; leadDays: number } | null {
  const window = series.slice(0, withinDays);

  for (let index = 0; index < window.length; index += 1) {
    const point = window[index]!;
    if (point.p50 < 0) {
      // leadDays = dias entre hoje e o cruzamento (série começa em D+1).
      return { point, leadDays: index + 1 };
    }
  }

  return null;
}

/** Meses completos de histórico entre a primeira e a última transação. */
export function monthsOfHistory(first: Date, last: Date): number {
  const months =
    (last.getUTCFullYear() - first.getUTCFullYear()) * 12 +
    (last.getUTCMonth() - first.getUTCMonth());
  return last.getUTCDate() >= first.getUTCDate() ? months : months - 1;
}

export function hasEnoughHistory(historyMonths: number): boolean {
  return historyMonths >= MIN_HISTORY_MONTHS;
}

/**
 * MAPE em pontos percentuais. Dias com valor real zero são ignorados —
 * a divisão explodiria e distorceria a métrica. Retorna null quando não
 * sobra nenhum par comparável: melhor não ter número do que ter número falso.
 */
export function meanAbsolutePercentageError(
  pairs: Array<{ actual: number; predicted: number }>,
): number | null {
  const comparable = pairs.filter((pair) => pair.actual !== 0);
  if (comparable.length === 0) return null;

  const total = comparable.reduce(
    (sum, pair) => sum + Math.abs((pair.actual - pair.predicted) / pair.actual),
    0,
  );

  return (total / comparable.length) * 100;
}
