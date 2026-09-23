import { prisma } from "@/lib/db";

export interface AccountSummary {
  balance: string;
  currency: string;
  updatedAt: Date;
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

export async function getAccountSummary(
  tenantId: string,
  userId: string,
): Promise<AccountSummary | null> {
  const account = await prisma.account.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { balance: true, currency: true, updatedAt: true },
  });

  if (!account) return null;

  return {
    balance: account.balance.toFixed(2),
    currency: account.currency,
    updatedAt: account.updatedAt,
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
