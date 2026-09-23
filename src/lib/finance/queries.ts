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
