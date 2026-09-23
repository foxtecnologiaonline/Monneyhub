import { prisma } from "@/lib/db";
import type { Transaction } from "@prisma/client";
import type { ExportableTransaction } from "@/lib/monneyhub/forecast/export";

/** Saldo atual = entradas − saídas. Uma consulta agregada, não N linhas. */
export async function getCurrentBalance(tenantId: string, userId: string): Promise<number> {
  const totals = await prisma.transaction.groupBy({
    by: ["type"],
    where: { tenantId, userId },
    _sum: { amount: true },
  });

  return totals.reduce((balance, row) => {
    const amount = row._sum.amount?.toNumber() ?? 0;
    return row.type === "EXPENSE" ? balance - amount : balance + amount;
  }, 0);
}

/** Extrato recente, pro handler do WhatsApp responder "meus últimos lançamentos". */
export async function getRecentTransactions(
  tenantId: string,
  userId: string,
  limit = 10,
): Promise<Transaction[]> {
  return prisma.transaction.findMany({
    where: { tenantId, userId },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}

/** Primeira e última transação — base pro gate de 6 meses de histórico. */
export async function getHistoryRange(
  tenantId: string,
  userId: string,
): Promise<{ first: Date; last: Date } | null> {
  const range = await prisma.transaction.aggregate({
    where: { tenantId, userId },
    _min: { occurredOn: true },
    _max: { occurredOn: true },
  });

  const first = range._min.occurredOn;
  const last = range._max.occurredOn;
  if (!first || !last) return null;

  return { first, last };
}

/** Usuários com transação — quem entra na rodada de treino. */
export async function listForecastableUsers(): Promise<
  Array<{ tenantId: string; userId: string }>
> {
  return prisma.transaction.findMany({
    distinct: ["tenantId", "userId"],
    select: { tenantId: true, userId: true },
    orderBy: [{ tenantId: "asc" }, { userId: "asc" }],
  });
}

/**
 * Lê o histórico em lotes por cursor: o dataset de treino é o banco inteiro,
 * e carregar tudo de uma vez na memória não escala junto com a base.
 */
export async function* streamTransactionsForExport(
  batchSize = 5000,
): AsyncGenerator<ExportableTransaction[]> {
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.transaction.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, tenantId: true, userId: true, occurredOn: true, amount: true, type: true },
    });

    if (batch.length === 0) return;

    yield batch.map((row) => ({
      tenantId: row.tenantId,
      userId: row.userId,
      occurredOn: row.occurredOn,
      amount: row.amount.toNumber(),
      type: row.type,
    }));

    if (batch.length < batchSize) return;
    cursor = batch[batch.length - 1]!.id;
  }
}
