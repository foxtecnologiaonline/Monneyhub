import type { ProductHandler, ProductName } from "@/lib/handlers/types";
import { salesAgentHandler } from "@/lib/handlers/sales-agent";
import { monneyhubZapHandler } from "@/lib/handlers/monneyhub-zap";
import { normasIaHandler } from "@/lib/handlers/normas-ia";
import { personaiHandler } from "@/lib/handlers/personai";

/** Registro único: cada produto plugado aqui pelo roteador de intenção. */
export const productHandlers: Record<ProductName, ProductHandler> = {
  "sales-agent": salesAgentHandler,
  "monneyhub-zap": monneyhubZapHandler,
  "normas-ia": normasIaHandler,
  personai: personaiHandler,
};
