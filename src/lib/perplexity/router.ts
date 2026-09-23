const DEFAULT_BASE_URL = "https://api.perplexity.ai";
const DEFAULT_MODEL = "sonar";

const SYSTEM_PROMPT = [
  "Você responde dúvidas de finanças pessoais e de MEI no WhatsApp, em português do Brasil.",
  "Use dado de mercado atual e cite o valor com a data de referência quando houver.",
  "Máximo 4 linhas, linguagem direta, sem jargão.",
  "Nunca recomende comprar, vender ou aplicar em nada específico: explique o cenário, não indique produto.",
].join(" ");

export interface MarketAnswer {
  text: string;
  citations: string[];
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  citations?: string[];
}

export function isRouterConfigured(): boolean {
  return Boolean(process.env.PERPLEXITY_API_KEY);
}

/**
 * Pergunta de mercado via Perplexity Router API (contexto em tempo real —
 * CDI, taxa, notícia). Endpoint e modelo ficam em env porque o Router é
 * compatível com o formato chat/completions: trocar de modelo/rota é
 * configuração, não deploy de código.
 *
 * `timeoutMs` é orçamento de latência, não sugestão — o critério de aceite
 * do produto é resposta em menos de 5s ponta a ponta.
 */
export async function askMarketQuestion(
  question: string,
  timeoutMs: number,
): Promise<MarketAnswer> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY não configurada.");
  }

  const baseUrl = process.env.PERPLEXITY_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.PERPLEXITY_MODEL ?? DEFAULT_MODEL;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Perplexity Router API falhou (${response.status}): ${body}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Perplexity Router API devolveu resposta vazia.");
  }

  return { text, citations: data.citations ?? [] };
}
