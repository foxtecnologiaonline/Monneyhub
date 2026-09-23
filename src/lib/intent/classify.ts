import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ProductName } from "@/lib/handlers/types";

const PRODUCTS = ["sales-agent", "monneyhub-zap", "normas-ia", "personai"] as const;

const ClassificationSchema = z.object({
  product: z.enum(PRODUCTS),
});

const PRODUCT_DESCRIPTIONS: Record<ProductName, string> = {
  "sales-agent": "qualificação e atendimento comercial a leads/prospects",
  "monneyhub-zap":
    "consulta financeira do MEI via WhatsApp (saldo, previsão de fluxo de caixa, lançamentos)",
  "normas-ia": "dúvidas sobre normas regulatórias e compliance",
  personai: "assistente pessoal de propósito geral, com memória de contexto do usuário",
};

const SYSTEM_PROMPT =
  `Você classifica mensagens de WhatsApp recebidas entre estes produtos:\n` +
  PRODUCTS.map((p) => `- ${p}: ${PRODUCT_DESCRIPTIONS[p]}`).join("\n");

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Decide qual produto trata a mensagem. Usa Claude quando há API key
 * configurada; sem ela (dev local, testes, ambiente ainda sem credencial),
 * cai num matcher por palavra-chave — determinístico e sem custo, mas
 * claramente mais rudimentar. Erro de API também cai no fallback: uma
 * mensagem roteada por keyword é melhor do que mensagem não respondida.
 */
export async function classifyIntent(text: string): Promise<ProductName> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return classifyByKeyword(text);
  }

  try {
    return await classifyWithClaude(text);
  } catch (err) {
    console.warn("[intent] classificação via Claude falhou, usando keyword:", err);
    return classifyByKeyword(text);
  }
}

async function classifyWithClaude(text: string): Promise<ProductName> {
  // Thinking desligado e saída estruturada: classificação é tarefa simples e
  // sensível a latência (MonneyHub Zap exige resposta < 5s ponta a ponta).
  const response = await getClient().messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 256,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
    output_config: { format: zodOutputFormat(ClassificationSchema) },
  });

  return response.parsed_output?.product ?? classifyByKeyword(text);
}

export function classifyByKeyword(text: string): ProductName {
  const lower = text.toLowerCase();
  if (/(saldo|fluxo de caixa|extrato|lançamento|\bmei\b)/.test(lower)) return "monneyhub-zap";
  if (/(norma|regulament|compliance|licença|fiscaliza)/.test(lower)) return "normas-ia";
  if (/(orçamento|comprar|preço|plano|proposta|contratar)/.test(lower)) return "sales-agent";
  return "personai";
}
