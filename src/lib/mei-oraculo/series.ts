/** Histórico mínimo pra treinar — abaixo disso o produto assume "aguardando dado". */
export const MIN_HISTORY_MONTHS = 6;

const MS_PER_DAY = 86_400_000;

export interface RawTransaction {
  amount: string;
  occurredAt: Date;
}

export interface DailyNet {
  date: Date;
  net: number;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Série diária de fluxo líquido. Dias sem lançamento entram como zero de
 * propósito: sem isso o modelo enxergaria um MEI que fatura todo dia, e a
 * variância — que é o que abre a faixa P10/P90 — sairia subestimada.
 */
export function buildDailyNetSeries(transactions: RawTransaction[]): DailyNet[] {
  if (transactions.length === 0) return [];

  const byDay = new Map<number, number>();
  for (const item of transactions) {
    const key = startOfUtcDay(item.occurredAt).getTime();
    byDay.set(key, (byDay.get(key) ?? 0) + Number(item.amount));
  }

  const keys = [...byDay.keys()].sort((a, b) => a - b);
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;

  const series: DailyNet[] = [];
  for (let time = first; time <= last; time += MS_PER_DAY) {
    series.push({ date: new Date(time), net: byDay.get(time) ?? 0 });
  }
  return series;
}

/** Meses cobertos pelo histórico (fracionário — 45 dias são 1,5 meses). */
export function historyMonths(series: DailyNet[]): number {
  if (series.length < 2) return 0;
  const first = series[0]!.date.getTime();
  const last = series[series.length - 1]!.date.getTime();
  return (last - first) / MS_PER_DAY / 30;
}

export function hasEnoughHistory(series: DailyNet[]): boolean {
  return historyMonths(series) >= MIN_HISTORY_MONTHS;
}
