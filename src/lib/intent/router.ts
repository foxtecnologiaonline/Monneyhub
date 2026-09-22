import { classifyIntent } from "@/lib/intent/classify";
import { productHandlers } from "@/lib/handlers/index";
import type { HandlerResponse, NormalizedMessage, ProductName } from "@/lib/handlers/types";

export interface RoutedResult {
  product: ProductName;
  response: HandlerResponse;
}

/** Classifica a mensagem e despacha pro handler do produto correspondente. */
export async function routeMessage(message: NormalizedMessage): Promise<RoutedResult> {
  const product = await classifyIntent(message.text);
  const handler = productHandlers[product];
  const response = await handler(message);
  return { product, response };
}
