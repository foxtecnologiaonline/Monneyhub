import type { ProductHandler, ProductName } from "@/lib/handlers/types";
import { salesAgentHandler } from "@/lib/handlers/sales-agent";
import { normasIaHandler } from "@/lib/handlers/normas-ia";
import { personaiHandler } from "@/lib/handlers/personai";

/**
 * Registro único: cada produto plugado aqui pelo roteador de intenção.
 *
 * O assistente financeiro de WhatsApp NÃO mora aqui. Ele é o ZapMonney, no repo
 * `foxtecnologiaonline/zapscript`, já em produção sobre Evolution API — ver
 * `docs/06-monneyhub-hub-visual.md`. Um handler financeiro neste gateway seria um
 * SEGUNDO assistente no ar, sobre outro banco, respondendo a mesma pessoa.
 */
export const productHandlers: Record<ProductName, ProductHandler> = {
  "sales-agent": salesAgentHandler,
  "normas-ia": normasIaHandler,
  personai: personaiHandler,
};
