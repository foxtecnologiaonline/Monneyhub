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

export interface StatementResult {
  currency: string;
  transactions: TransactionLine[];
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

/** Uma query só: conta e lançamentos vêm no mesmo round trip. */
export async function getRecentTransactions(
  tenantId: string,
  userId: string,
  limit = 5,
): Promise<StatementResult | null> {
  const account = await prisma.account.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: {
      currency: true,
      transactions: {
        orderBy: { occurredAt: "desc" },
        take: limit,
        select: { description: true, amount: true, occurredAt: true },
      },
    },
  });

  if (!account) return null;

  return {
    currency: account.currency,
    transactions: account.transactions.map((item) => ({
      description: item.description,
      amount: item.amount.toFixed(2),
      occurredAt: item.occurredAt,
    })),
  };
}

