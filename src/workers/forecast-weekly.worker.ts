import { prisma } from "@/lib/db";
import {
  buildForecastReportFromHistory,
  loadAccountHistory,
  persistForecastRun,
} from "@/lib/mei-oraculo/service";
import { isExportConfigured, uploadForecastSeries } from "@/lib/mei-oraculo/export";
import { getForecastAlertQueue } from "@/lib/mei-oraculo/queue";

/**
 * Atualização semanal do MEI-Oráculo: exporta o histórico, roda a previsão,
 * persiste a execução (com MAPE) e enfileira alerta quando o saldo mediano
 * cruza zero dentro de 30 dias. Rodar com `npm run worker:forecast`.
 *
 * Processa conta a conta, em sequência: é job semanal, não tem pressa, e
 * paralelizar aqui só serviria pra competir por conexão de banco.
 */
export async function runWeeklyForecast(): Promise<{ processed: number; alerts: number }> {
  const accounts = await prisma.account.findMany({ select: { tenantId: true, userId: true } });

  let alerts = 0;

  for (const account of accounts) {
    // Uma consulta só: a série que o export precisa é a mesma que o
    // relatório já usa internamente — buscar de novo seria dobrar o
    // round-trip ao banco por conta, todo job semanal.
    const history = await loadAccountHistory(account.tenantId, account.userId);
    const report = buildForecastReportFromHistory(history);

    let exportKey: string | null = null;
    if (isExportConfigured() && history) {
      exportKey = await uploadForecastSeries({
        tenantId: account.tenantId,
        userId: account.userId,
        series: history.series,
      });
    }

    await persistForecastRun({
      tenantId: account.tenantId,
      userId: account.userId,
      report,
      exportKey,
    });

    if (report.alert) {
      await getForecastAlertQueue().add("negative-balance", {
        tenantId: account.tenantId,
        userId: account.userId,
        crossesAtDay: report.alert.crossesAtDay,
        leadDays: report.alert.leadDays,
        projectedBalance: report.alert.projectedBalance,
      });
      alerts += 1;
    }
  }

  return { processed: accounts.length, alerts };
}

if (process.argv[1]?.includes("forecast-weekly")) {
  runWeeklyForecast()
    .then((result) => {
      console.info(
        `[forecast-weekly] ${result.processed} conta(s) processada(s), ${result.alerts} alerta(s)`,
      );
    })
    .catch((error) => {
      console.error("[forecast-weekly] falhou:", error);
      process.exitCode = 1;
    });
}
