import { prisma } from "@/lib/db";
import type { Tenant } from "@prisma/client";

/**
 * Identifica o tenant a partir do phone_number_id que a Meta manda em
 * `entry[].changes[].value.metadata.phone_number_id` — é o número de
 * WhatsApp Business que recebeu a mensagem, um por tenant.
 *
 * Um único POST de webhook pode trazer mensagens de vários números, então
 * resolve todos numa consulta só em vez de uma por mensagem.
 */
export async function findTenantsByPhoneNumberIds(
  phoneNumberIds: string[],
): Promise<Map<string, Tenant>> {
  const unique = [...new Set(phoneNumberIds)];
  if (unique.length === 0) return new Map();

  const tenants = await prisma.tenant.findMany({
    where: { whatsappPhoneNumberId: { in: unique } },
  });

  return new Map(tenants.map((tenant) => [tenant.whatsappPhoneNumberId, tenant]));
}
