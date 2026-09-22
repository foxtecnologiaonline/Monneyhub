import { prisma } from "@/lib/db";
import type { Tenant } from "@prisma/client";

/**
 * Identifica o tenant a partir do phone_number_id que a Meta manda em
 * `entry[].changes[].value.metadata.phone_number_id` — é o número de
 * WhatsApp Business que recebeu a mensagem, um por tenant.
 */
export async function identifyTenantByPhoneNumberId(
  phoneNumberId: string,
): Promise<Tenant | null> {
  return prisma.tenant.findUnique({ where: { whatsappPhoneNumberId: phoneNumberId } });
}
