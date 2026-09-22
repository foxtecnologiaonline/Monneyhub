import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Cria um tenant de exemplo pra dev local — sem isso o Gateway não tem
 * contra o que resolver o phone_number_id do webhook.
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
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
