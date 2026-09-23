import type { ProductHandler } from "@/lib/handlers/types";
import { getCurrentBalance, getRecentTransactions } from "@/lib/monneyhub/balance";
import { getLatestForecast } from "@/lib/monneyhub/forecast/read";
import { askMarketQuestion } from "@/lib/monneyhub/zap/perplexity";
import { analyzeOutboundText } from "@/lib/monneyhub/zap/content-safety";
import {
  applyInvestmentDisclaimer,
  classifyFinancialIntent,
  type FinancialIntent,
} from "@/lib/monneyhub/zap/rules";

const BLOCKED_REPLY =
  "Não consigo responder isso por aqui. Se precisar, fale com nosso time de atendimento.";
const MARKET_FALLBACK =
  "Não consegui consultar o dado de mercado agora. Tenta de novo em alguns minutos?";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * MonneyHub Zap (Fase 1): assistente financeiro no WhatsApp. Consulta de
 * saldo/extrato/previsão sai do Postgres; pergunta aberta de mercado vai
 * pra Router API da Perplexity. Toda resposta passa por Content Safety e
 * ganha disclaimer quando toca em investimento.
 */
export const monneyhubZapHandler: ProductHandler = async (message) => {
  const intent = classifyFinancialIntent(message.text);
  const answer = await buildAnswer(intent, message.tenantId, message.userId, message.text);

  const withDisclaimer = applyInvestmentDisclaimer(answer, message.text);
  const verdict = await analyzeOutboundText(withDisclaimer);

  if (!verdict.safe) {
    console.warn(
      `[monneyhub-zap] resposta bloqueada pelo Content Safety: ` +
        verdict.flagged.map((f) => `${f.category}=${f.severity}`).join(", "),
    );
    return {
      replyText: BLOCKED_REPLY,
      meta: { product: "monneyhub-zap", intent, blocked: true },
    };
  }

  return {
    replyText: withDisclaimer,
    meta: { product: "monneyhub-zap", intent },
  };
};

async function buildAnswer(
  intent: FinancialIntent,
  tenantId: string,
  userId: string,
  question: string,
): Promise<string> {
  switch (intent) {
    case "BALANCE": {
      const balance = await getCurrentBalance(tenantId, userId);
      return `Seu saldo atual é ${brl.format(balance)}.`;
    }

    case "STATEMENT": {
      const transactions = await getRecentTransactions(tenantId, userId, 5);
      if (transactions.length === 0) return "Você ainda não tem lançamentos registrados.";

      const lines = transactions.map((transaction) => {
        const signal = transaction.type === "EXPENSE" ? "−" : "+";
        const label = transaction.description ?? "lançamento";
        return `${shortDate.format(transaction.occurredOn)} ${signal}${brl.format(
          transaction.amount.toNumber(),
        )} — ${label}`;
      });

      return `Seus últimos lançamentos:\n${lines.join("\n")}`;
    }

    case "FORECAST":
      return formatForecast(await getLatestForecast(tenantId, userId));

    case "MARKET":
      try {
        return await askMarketQuestion(question);
      } catch (err) {
        console.warn("[monneyhub-zap] Router API falhou:", err);
        return MARKET_FALLBACK;
      }
  }
}

function formatForecast(forecast: Awaited<ReturnType<typeof getLatestForecast>>): string {
  if (forecast.status === "AWAITING_DATA" || forecast.status === "NO_RUN") {
    const missing = forecast.missingMonths;
    const complement = missing
      ? ` Faltam cerca de ${missing} ${missing === 1 ? "mês" : "meses"} de histórico.`
      : "";
    return `Ainda não tenho histórico suficiente pra projetar seu fluxo de caixa.${complement}`;
  }

  if (forecast.status !== "READY") {
    return "Sua previsão está sendo atualizada. Me pergunta de novo daqui a pouco.";
  }

  const linhas = (forecast.horizons ?? [])
    .filter((horizon) => horizon.realista !== null)
    .map(
      (horizon) =>
        `Em ${horizon.horizonDays} dias: ${brl.format(horizon.realista!)} ` +
        `(entre ${brl.format(horizon.pessimista!)} e ${brl.format(horizon.otimista!)})`,
    );

  const alerta = forecast.negativeBalanceAlert
    ? `\n\nAtenção: no cenário realista seu saldo fica negativo em ` +
      `${forecast.negativeBalanceAlert.crossingDate} — ${forecast.negativeBalanceAlert.leadDays} dias a partir de hoje.`
    : "";

  return `Projeção do seu saldo:\n${linhas.join("\n")}${alerta}`;
}
