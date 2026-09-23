import type { DailyNet } from "@/lib/mei-oraculo/series";

/** Quantil normal padrão para 10% / 90%. */
const Z_80 = 1.2816;

export const HORIZON_DAYS = [30, 60, 90] as const;

export interface HorizonForecast {
  horizonDays: number;
  /** Pessimista */
  p10: number;
  /** Realista */
  p50: number;
  /** Otimista */
  p90: number;
}

export interface ForecastResult {
  horizons: HorizonForecast[];
  /** Caminho diário do P50, dia 1..maxHorizon — usado pelo alerta. */
  medianPath: number[];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[], average: number): number {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Baseline de série temporal: fluxo diário tratado como passeio aleatório
 * com deriva. Projeção em t dias tem média t*mu e desvio sqrt(t)*sigma — o
 * sqrt é o que faz a faixa abrir com o horizonte, que é exatamente o efeito
 * que o produto quer comunicar ("90 dias é mais incerto que 30").
 *
 * Fica atrás desta interface de propósito: trocar por um modelo gerenciado
 * (Forecast/SageMaker) é substituir esta função, não o produto em volta —
 * e a decisão de fornecedor ainda está aberta.
 */
export function forecastBalance(params: {
  currentBalance: number;
  series: DailyNet[];
  horizons?: readonly number[];
}): ForecastResult {
  const horizons = params.horizons ?? HORIZON_DAYS;
  const nets = params.series.map((point) => point.net);

  const mu = nets.length > 0 ? mean(nets) : 0;
  const sigma = nets.length > 0 ? stdDev(nets, mu) : 0;

  const maxHorizon = Math.max(...horizons);
  const medianPath: number[] = [];
  for (let day = 1; day <= maxHorizon; day += 1) {
    medianPath.push(params.currentBalance + day * mu);
  }

  const horizonForecasts = horizons.map((horizonDays) => {
    const center = params.currentBalance + horizonDays * mu;
    const spread = Z_80 * Math.sqrt(horizonDays) * sigma;
    return {
      horizonDays,
      p10: center - spread,
      p50: center,
      p90: center + spread,
    };
  });

  return { horizons: horizonForecasts, medianPath };
}
