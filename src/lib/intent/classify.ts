import Anthropic from "@anthropic-ai/sdk";
import type { ProductName } from "@/lib/handlers/types";

const PRODUCTS: ProductName[] = ["sales-agent", "monneyhub-zap", "normas-ia", "personai"];

const PRODUCT_DESCRIPTIONS: Record<ProductName, string> = {
  "sales-agent": "qualificação e atendimento comercial a leads/prospects",
  "monneyhub-zap":
    "consulta financeira do MEI via WhatsApp (saldo, previsão de fluxo de caixa, lançamentos)",
  "normas-ia": "dúvidas sobre normas regulatórias e compliance",
  personai: "assistente pessoal de propósito geral, com memória de contexto do usuário",
};

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Decide qual produto trata a mensagem. Usa Claude quando há API key
 * configurada; sem ela (dev local, testes, ambiente ainda sem credencial),
 * cai num matcher por palavra-chave — determinístico e sem custo, mas
 * claramente mais rudimentar. `identifyProductWithClaude` fica isolado
 * pra o fallback ser trivial de testar sem mockar a SDK inteira.
 */
export async function classifyIntent(text: string): Promise<ProductName> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return classifyByKeyword(text);
  }
  return classifyWithClaude(text);
}

async function classifyWithClaude(text: string): Promise<ProductName> {
  const productList = PRODUCTS.map((p) => `- ${p}: ${PRODUCT_DESCRIPTIONS[p]}`).join("\n");

  const message = await getClient().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16,
    system:
      `Você classifica mensagens de WhatsApp recebidas entre estes produtos:\n${productList}\n\n` +
      `Responda apenas com o nome exato de um dos produtos acima, nada mais.`,
    messages: [{ role: "user", content: text }],
  });

  const raw = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim()
    .toLowerCase();

  return PRODUCTS.find((p) => raw.includes(p)) ?? classifyByKeyword(text);
}

export function classifyByKeyword(text: string): ProductName {
  const lower = text.toLowerCase();
  if (/(saldo|fluxo de caixa|extrato|lançamento|\bmei\b)/.test(lower)) return "monneyhub-zap";
  if (/(norma|regulament|compliance|licença|fiscaliza)/.test(lower)) return "normas-ia";
  if (/(orçamento|comprar|preço|plano|proposta|contratar)/.test(lower)) return "sales-agent";
  return "personai";
}
