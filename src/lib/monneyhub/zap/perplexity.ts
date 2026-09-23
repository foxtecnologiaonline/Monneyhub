/**
 * Perplexity Router API — contexto de mercado em tempo real (CDI, Selic,
 * notícia). Usado só na pergunta aberta; consulta de saldo/extrato não sai
 * do Postgres.
 */

const DEFAULT_BASE_URL = "https://api.perplexity.ai";
/** Orçamento de latência: o alvo do produto é resposta em menos de 5s ponta a ponta. */
const REQUEST_TIMEOUT_MS = 3500;

const SYSTEM_PROMPT =
  "Você responde dúvidas financeiras de microempreendedores brasileiros (MEI) " +
  "em português, de forma objetiva, em no máximo 4 frases, usando dado de " +
  "mercado atual quando for relevante. Nunca recomende um investimento " +
  "específico nem prometa retorno.";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function askMarketQuestion(question: string): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY não configurada.");

  const baseUrl = process.env.PERPLEXITY_API_BASE ?? DEFAULT_BASE_URL;
  const model = process.env.PERPLEXITY_MODEL ?? "sonar";

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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Perplexity respondeu ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as ChatCompletionResponse;
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Perplexity devolveu resposta vazia.");

  return content;
}
