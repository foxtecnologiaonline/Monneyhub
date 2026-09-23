/** Janela em que um saldo negativo previsto vira alerta proativo. */
export const ALERT_WINDOW_DAYS = 30;

/** Antecedência mínima exigida pelo critério de aceite. */
export const MIN_ALERT_LEAD_DAYS = 15;

export interface NegativeBalanceAlert {
  /** Dia (1-based) em que o P50 cruza zero. */
  crossesAtDay: number;
  /** Antecedência do aviso: igual ao dia do cruzamento, contado de hoje. */
  leadDays: number;
  projectedBalance: number;
}

/**
 * Dispara quando o caminho mediano (P50) cruza zero dentro da janela.
 * Usa o P50 e não o P10 de propósito: alertar no pessimista encheria o
 * usuário de falso positivo e o alerta perderia o valor.
 */
export function findNegativeBalanceAlert(
  medianPath: number[],
  windowDays = ALERT_WINDOW_DAYS,
): NegativeBalanceAlert | null {
  const limit = Math.min(windowDays, medianPath.length);

  for (let index = 0; index < limit; index += 1) {
    const projectedBalance = medianPath[index]!;
    if (projectedBalance < 0) {
      const day = index + 1;
      return { crossesAtDay: day, leadDays: day, projectedBalance };
    }
  }

  return null;
}
