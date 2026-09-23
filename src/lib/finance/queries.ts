import { prisma } from "@/lib/db";

export interface AccountSummary {
  balance: string;
  currency: string;
}

export interface TransactionLine {
  description: string;
  amount: string;
  occurredAt: Date;
}

/** Histórico de uma série temporal (tenant+usuário) pro export do Forecast. */
export interface ExportableTransaction {
  tenantId: string;
  userId: string;
  occurredAt: Date;
  /** Assinado: negativo = saída, positivo = entrada. */
  amount: number;
}

/**
 * Saldo derivado das transações, não materializado na conta: a soma agregada
 * custa pouco no banco e nunca diverge do extrato, que é o risco de manter
 * saldo armazenado em dois lugares.
 */
export async function getAccountSummary(
  tenantId: string,
  userId: string,
): Promise<AccountSummary | null> {
  const account = await prisma.account.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { id: true, currency: true },
  });

  if (!account) return null;

  const total = await prisma.transaction.aggregate({
    where: { accountId: account.id },
    _sum: { amount: true },
  });

  return {
    balance: (total._sum.amount?.toNumber() ?? 0).toFixed(2),
    currency: account.currency,
  };
}

export async function getRecentTransactions(
  tenantId: string,
  userId: string,
  limit = 5,
): Promise<TransactionLine[] | null> {
  const account = await prisma.account.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { id: true },
  });

  if (!account) return null;

  const transactions = await prisma.transaction.findMany({
    where: { accountId: account.id },
    orderBy: { occurredAt: "desc" },
    take: limit,
    select: { description: true, amount: true, occurredAt: true },
  });

  return transactions.map((item) => ({
    description: item.description,
    amount: item.amount.toFixed(2),
    occurredAt: item.occurredAt,
  }));
}

/** Saldo como número — o MEI-Oráculo acumula a previsão a partir dele. */
export async function getCurrentBalance(tenantId: string, userId: string): Promise<number> {
  const summary = await getAccountSummary(tenantId, userId);
  return summary ? Number(summary.balance) : 0;
}

/** Primeira e última transação — base pro gate de 6 meses de histórico. */
export async function getHistoryRange(
  tenantId: string,
  userId: string,
): Promise<{ first: Date; last: Date } | null> {
  const account = await prisma.account.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { id: true },
  });
  if (!account) return null;

  const range = await prisma.transaction.aggregate({
    where: { accountId: account.id },
    _min: { occurredAt: true },
    _max: { occurredAt: true },
  });

  const first = range._min.occurredAt;
  const last = range._max.occurredAt;
  if (!first || !last) return null;

  return { first, last };
}

/** Contas com ao menos uma transação — quem entra na rodada de treino. */
export async function listForecastableUsers(): Promise<
  Array<{ tenantId: string; userId: string }>
> {
  return prisma.account.findMany({
    where: { transactions: { some: {} } },
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
      select: {
        id: true,
        amount: true,
        occurredAt: true,
        account: { select: { tenantId: true, userId: true } },
      },
    });

    if (batch.length === 0) return;

    yield batch.map((row) => ({
      tenantId: row.account.tenantId,
      userId: row.account.userId,
      occurredAt: row.occurredAt,
      amount: row.amount.toNumber(),
    }));

    if (batch.length < batchSize) return;
    cursor = batch[batch.length - 1]!.id;
  }
}
