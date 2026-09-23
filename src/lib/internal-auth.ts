import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * API interna (não é pública): protegida por chave compartilhada entre
 * serviços internos FOX TecnologIA, não por login de usuário final.
 * Comparação em tempo constante — `===` em segredo vaza por timing.
 */
export function isAuthorizedInternalRequest(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    throw new Error("INTERNAL_API_KEY não configurada.");
  }

  const received = request.headers.get("x-internal-api-key");
  if (!received) return false;

  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(received, "utf8");
  if (expectedBuf.length !== receivedBuf.length) return false;

  return timingSafeEqual(expectedBuf, receivedBuf);
}
