import type { HandlerResponse, ProductHandler } from "@/lib/handlers/types";
import { classifyZapIntent, type ZapIntent } from "@/lib/monneyhub-zap/classify";
import { withInvestmentDisclaimer } from "@/lib/monneyhub-zap/disclaimer";
import { getAccountSummary, getRecentTransactions } from "@/lib/finance/queries";
import { askMarketQuestion, isRouterConfigured } from "@/lib/perplexity/router";
import { analyzeOutboundText } from "@/lib/safety/content-safety";

// Orçamento de latência: o critério de aceite é resposta em menos de 5s
// ponta a ponta. Router API fica com a maior fatia, Content Safety com o
// resto, e ainda sobra margem pro envio via Graph API.
const ROUTER_TIMEOUT_MS = 3000;
const CONTENT_SAFETY_TIMEOUT_MS = 1200;

const NO_ACCOUNT_REPLY =
  "Não encontrei uma conta MonneyHub ligada a este número. Fale com o suporte pra vincular.";
const UNAVAILABLE_REPLY =
  "Não consegui buscar essa informação de mercado agora. Tenta de novo em instantes.";
const BLOCKED_REPLY =
  "Prefiro não responder isso por aqui. Se for sobre sua conta, pergunta do saldo ou do extrato que eu te mostro.";

const CURRENCY_LABEL: Record<string, string> = { BRL: "R$", USD: "US$", EUR: "€" };

function formatMoney(amount: string, currency: string): string {
  const symbol = CURRENCY_LABEL[currency] ?? currency;
  return `${symbol} ${amount.replace(".", ",")}`;
}

async function buildAnswer(
  intent: ZapIntent,
  message: Parameters<ProductHandler>[0],
): Promise<{ text: string; modelGenerated: boolean }> {
  if (intent === "BALANCE") {
    const summary = await getAccountSummary(message.tenantId, message.userId);
    if (!summary) return { text: NO_ACCOUNT_REPLY, modelGenerated: false };
    return {
      text: `Seu saldo atual é ${formatMoney(summary.balance, summary.currency)}.`,
      modelGenerated: false,
    };
  }

  if (intent === "STATEMENT") {
    const transactions = await getRecentTransactions(message.tenantId, message.userId);
    if (!transactions) return { text: NO_ACCOUNT_REPLY, modelGenerated: false };
    if (transactions.length === 0) {
      return { text: "Não há lançamentos registrados na sua conta ainda.", modelGenerated: false };
    }

    const lines = transactions.map((item) => {
      const date = item.occurredAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      return `• ${date} — ${item.description}: ${formatMoney(item.amount, "BRL")}`;
    });
    return { text: `Seus últimos lançamentos:\n${lines.join("\n")}`, modelGenerated: false };
  }

  if (!isRouterConfigured()) {
    return { text: UNAVAILABLE_REPLY, modelGenerated: false };
  }

  try {
    const answer = await askMarketQuestion(message.text, ROUTER_TIMEOUT_MS);
    return { text: answer.text, modelGenerated: true };
  } catch (error) {
    console.error("[monneyhub-zap] Router API indisponível:", error);
    return { text: UNAVAILABLE_REPLY, modelGenerated: false };
  }
}

/**
 * MonneyHub Zap (Fase 1): classifica a pergunta financeira, responde com
 * dado interno (Postgres) ou dado de mercado (Perplexity Router API), passa
 * tudo por Content Safety e carimba o disclaimer quando o assunto encosta em
 * investimento.
 */
export const monneyhubZapHandler: ProductHandler = async (message): Promise<HandlerResponse> => {
  const intent = classifyZapIntent(message.text);
  const answer = await buildAnswer(intent, message);

  const verdict = await analyzeOutboundText(answer.text, {
    timeoutMs: CONTENT_SAFETY_TIMEOUT_MS,
    failClosed: answer.modelGenerated,
  });

  const safeText = verdict.allowed ? answer.text : BLOCKED_REPLY;
  const replyText = withInvestmentDisclaimer(safeText, message.text);

  return {
    replyText,
    meta: {
      product: "monneyhub-zap",
      intent,
      modelGenerated: answer.modelGenerated,
      contentSafety: verdict.status,
      blocked: !verdict.allowed,
    },
  };
};
