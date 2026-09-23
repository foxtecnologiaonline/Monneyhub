import type { ExportableTransaction } from "@/lib/finance/queries";

/**
 * Pipeline de export do histórico transacional pro formato que o Amazon
 * Forecast aceita (TARGET_TIME_SERIES): `item_id,timestamp,target_value`,
 * sem cabeçalho, timestamp diário em AAAA-MM-DD.
 */

export interface DailyNetFlowRow {
  itemId: string;
  date: string;
  netAmount: number;
}

/** item_id do Forecast: o par tenant+usuário é a série temporal. */
export function buildItemId(tenantId: string, userId: string): string {
  return `${tenantId}::${userId}`;
}

export function parseItemId(itemId: string): { tenantId: string; userId: string } | null {
  const [tenantId, userId] = itemId.split("::");
  if (!tenantId || !userId) return null;
  return { tenantId, userId };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Agrega o fluxo líquido por dia. Os valores já vêm assinados do banco
 * (negativo = saída), então é soma direta. Dias sem transação não viram
 * linha: o Forecast preenche a lacuna na featurização, e emitir zero pra
 * todo dia inflaria o dataset sem acrescentar sinal.
 */
export function aggregateDailyNetFlow(
  transactions: ExportableTransaction[],
): DailyNetFlowRow[] {
  const totals = new Map<string, DailyNetFlowRow>();

  for (const transaction of transactions) {
    const itemId = buildItemId(transaction.tenantId, transaction.userId);
    const date = toIsoDate(transaction.occurredAt);
    const key = `${itemId}|${date}`;

    const existing = totals.get(key);
    if (existing) {
      existing.netAmount += transaction.amount;
    } else {
      totals.set(key, { itemId, date, netAmount: transaction.amount });
    }
  }

  return [...totals.values()].sort(
    (a, b) => a.itemId.localeCompare(b.itemId) || a.date.localeCompare(b.date),
  );
}

/** CSV sem cabeçalho, como o Forecast espera na ingestão. */
export function buildTargetTimeSeriesCsv(rows: DailyNetFlowRow[]): string {
  return rows.map((row) => `${row.itemId},${row.date},${row.netAmount.toFixed(2)}`).join("\n");
}
