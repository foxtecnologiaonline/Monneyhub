import type { HandlerResponse, ProductHandler } from "@/lib/handlers/types";
import { classifyZapIntent, type ZapIntent } from "@/lib/monneyhub-zap/classify";
import { withInvestmentDisclaimer } from "@/lib/monneyhub-zap/disclaimer";
import { getAccountSummary, getRecentTransactions } from "@/lib/finance/queries";
import { askMarketQuestion, isRouterConfigured } from "@/lib/perplexity/router";
import { analyzeOutboundText } from "@/lib/safety/content-safety";
import { buildForecastReport } from "@/lib/mei-oraculo/service";

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

/**
 * Intl e não concatenação manual: sem separador de milhar, "R$ 1200,50" é
 * o tipo de detalhe que faz o MEI desconfiar do número. O replace troca o
 * espaço não-quebrável que o Intl insere por espaço comum — WhatsApp lida
 * melhor, e é o que os testes leem.
 */
function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency })
      .format(value)
      .replace(/ /g, " ");
  } catch {
    return `${currency} ${value.toFixed(2).replace(".", ",")}`;
  }
}

/**
 * Previsão vem do MEI-Oráculo, não da Router API: é pergunta sobre o caixa
 * do próprio usuário, e mandar isso pra uma busca externa seria ao mesmo
 * tempo inútil e vazamento de contexto.
 *
 * Sempre faixa, nunca número único — o doc do MEI-Oráculo é explícito em
 * evitar falsa precisão. E nenhuma sugestão de ação: recomendar corte de
 * gasto está fora de escopo do v1.
 */
async function buildForecastReply(message: Parameters<ProductHandler>[0]): Promise<string> {
  const report = await buildForecastReport(message.tenantId, message.userId);

  if (report.status === "NO_ACCOUNT") return NO_ACCOUNT_REPLY;

  if (report.status === "INSUFFICIENT_HISTORY") {
    const months = Math.floor(report.historyMonths);
    return (
      `Ainda não dá pra projetar seu caixa com confiança: tenho ${months} ` +
      `${months === 1 ? "mês" : "meses"} de histórico e preciso de ${report.minHistoryMonths}. ` +
      `Seguindo seus lançamentos, chego lá.`
    );
  }

  const currency = report.currency ?? "BRL";
  const lines = report.horizons.map(
    (horizon) =>
      `• ${horizon.horizonDays} dias: entre ${formatMoney(horizon.p10.toFixed(2), currency)} e ` +
      `${formatMoney(horizon.p90.toFixed(2), currency)} — cenário provável ` +
      `${formatMoney(horizon.p50.toFixed(2), currency)}`,
  );

  const parts = [`Projeção do seu caixa:\n${lines.join("\n")}`];

  if (report.alert) {
    parts.push(
      `⚠️ No cenário provável, seu saldo fica negativo em cerca de ` +
        `${report.alert.crossesAtDay} dias.`,
    );
  }

  return parts.join("\n\n");
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
    const statement = await getRecentTransactions(message.tenantId, message.userId);
    if (!statement) return { text: NO_ACCOUNT_REPLY, modelGenerated: false };
    if (statement.transactions.length === 0) {
      return { text: "Não há lançamentos registrados na sua conta ainda.", modelGenerated: false };
    }

    const lines = statement.transactions.map((item) => {
      const date = item.occurredAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      return `• ${date} — ${item.description}: ${formatMoney(item.amount, statement.currency)}`;
    });
    return { text: `Seus últimos lançamentos:\n${lines.join("\n")}`, modelGenerated: false };
  }

  if (intent === "FORECAST") {
    // Previsão é dado nosso (MEI-Oráculo), montado por template — não é
    // saída de LLM, então não precisa fail-closed no Content Safety.
    return { text: await buildForecastReply(message), modelGenerated: false };
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
 * dado interno (saldo, extrato, previsão do MEI-Oráculo) ou dado de mercado
 * (Perplexity Router API), passa tudo por Content Safety e carimba o
 * disclaimer quando o assunto encosta em investimento.
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
