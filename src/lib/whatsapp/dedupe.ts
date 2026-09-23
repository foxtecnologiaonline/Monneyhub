import { getRedisConnection } from "@/lib/redis";

/** Janela de reentrega da Meta — depois disso o wamid pode sair do cache. */
const DEDUPE_TTL_SECONDS = 86_400;

/**
 * A Meta reentrega o webhook quando não recebe 2xx a tempo. Sem isto, a
 * mesma mensagem é processada de novo e o usuário recebe a resposta
 * duplicada — num produto conversacional isso é visível e corrói confiança.
 *
 * SET NX é atômico: o primeiro a gravar processa, os outros desistem. Isso
 * também cobre corrida entre réplicas do webhook, que um "verifica depois
 * grava" não cobriria.
 */
export async function claimWhatsAppMessage(waMessageId: string): Promise<boolean> {
  const result = await getRedisConnection().set(
    `whatsapp:seen:${waMessageId}`,
    "1",
    "EX",
    DEDUPE_TTL_SECONDS,
    "NX",
  );
  return result === "OK";
}
