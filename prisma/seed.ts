import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXAMPLE_USER_ID = "5511999990000";

/**
 * Cria um tenant de exemplo pra dev local — sem isso o Gateway não tem
 * contra o que resolver o phone_number_id do webhook — e uma conta com
 * lançamentos, pra testar saldo/extrato do MonneyHub Zap sem dado real.
 * Valores fictícios de propósito: nada de número financeiro de cliente.
 */
async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { whatsappPhoneNumberId: "0000000000" },
    create: {
      name: "Tenant de exemplo",
      whatsappPhoneNumberId: "0000000000",
    },
    update: {},
  });
  console.info("Tenant de exemplo:", tenant);

  const account = await prisma.account.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: EXAMPLE_USER_ID } },
    create: {
      tenantId: tenant.id,
      userId: EXAMPLE_USER_ID,
      name: "Conta de exemplo",
      balance: "1250.00",
    },
    update: {},
  });

  const existing = await prisma.transaction.count({ where: { accountId: account.id } });
  if (existing === 0) {
    await prisma.transaction.createMany({
      data: [
        {
          accountId: account.id,
          description: "Venda de serviço",
          amount: "800.00",
          occurredAt: new Date("2026-09-18T10:00:00Z"),
        },
        {
          accountId: account.id,
          description: "Material de escritório",
          amount: "-120.00",
          occurredAt: new Date("2026-09-19T14:30:00Z"),
        },
        {
          accountId: account.id,
          description: "Taxa bancária",
          amount: "-30.00",
          occurredAt: new Date("2026-09-20T09:15:00Z"),
        },
      ],
    });
  }
  console.info("Conta de exemplo:", account.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
