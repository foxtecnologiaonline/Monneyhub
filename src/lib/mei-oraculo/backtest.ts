import type { DailyNet } from "@/lib/mei-oraculo/series";
import { forecastBalance } from "@/lib/mei-oraculo/forecast";
import { findNegativeBalanceAlert, MIN_ALERT_LEAD_DAYS } from "@/lib/mei-oraculo/alert";

/** Saldo muito perto de zero faz o erro percentual explodir — ponto descartado. */
const MAPE_EPSILON = 1;

export interface BacktestResult {
  /** Erro percentual médio absoluto do P50, em %. null = sem ponto utilizável. */
  mape: number | null;
  /** Antecedência real do alerta, em dias. null = não houve evento ou não alertamos. */
  alertLeadDays: number | null;
  actualFirstNegativeDay: number | null;
  predictedAlertDay: number | null;
  meetsLeadRequirement: boolean;
  testDays: number;
}

/**
 * MAPE clássico, pulando pontos com saldo quase zero: o denominador iria a
 * zero e um único dia perto do zero dominaria a média inteira. Retorna null
 * quando não sobra ponto — é honesto dizer "não dá pra medir" em vez de
 * publicar um número inventado.
 */
export function mape(actual: number[], predicted: number[]): number | null {
  const usable: number[] = [];

  for (let index = 0; index < Math.min(actual.length, predicted.length); index += 1) {
    const actualValue = actual[index]!;
    if (Math.abs(actualValue) < MAPE_EPSILON) continue;
    usable.push(Math.abs((actualValue - predicted[index]!) / actualValue));
  }

  if (usable.length === 0) return null;
  return (usable.reduce((sum, value) => sum + value, 0) / usable.length) * 100;
}

/**
 * Teste retroativo: corta os últimos `horizonDays` do histórico, prevê a
 * partir do corte e compara com o que de fato aconteceu. É o que sustenta
 * os dois critérios de aceite — MAPE medido e antecedência do alerta.
 */
export function backtest(params: {
  series: DailyNet[];
  /** Saldo ao fim da série (hoje). */
  currentBalance: number;
  horizonDays?: number;
}): BacktestResult {
  const horizonDays = params.horizonDays ?? 30;
  const { series, currentBalance } = params;

  if (series.length <= horizonDays) {
    return {
      mape: null,
      alertLeadDays: null,
      actualFirstNegativeDay: null,
      predictedAlertDay: null,
      meetsLeadRequirement: false,
      testDays: 0,
    };
  }

  const cut = series.length - horizonDays;
  const train = series.slice(0, cut);
  const test = series.slice(cut);

  const testNetTotal = test.reduce((sum, point) => sum + point.net, 0);
  const balanceAtCut = currentBalance - testNetTotal;

  const actualPath: number[] = [];
  let running = balanceAtCut;
  for (const point of test) {
    running += point.net;
    actualPath.push(running);
  }

  const forecast = forecastBalance({
    currentBalance: balanceAtCut,
    series: train,
    horizons: [horizonDays],
  });
  const predictedPath = forecast.medianPath.slice(0, horizonDays);

  const actualNegativeIndex = actualPath.findIndex((value) => value < 0);
  const actualFirstNegativeDay = actualNegativeIndex === -1 ? null : actualNegativeIndex + 1;

  const predictedAlert = findNegativeBalanceAlert(predictedPath, horizonDays);
  const predictedAlertDay = predictedAlert?.crossesAtDay ?? null;

  const alertLeadDays =
    predictedAlertDay !== null && actualFirstNegativeDay !== null ? actualFirstNegativeDay : null;

  return {
    mape: mape(actualPath, predictedPath),
    alertLeadDays,
    actualFirstNegativeDay,
    predictedAlertDay,
    meetsLeadRequirement: alertLeadDays !== null && alertLeadDays >= MIN_ALERT_LEAD_DAYS,
    testDays: horizonDays,
  };
}
