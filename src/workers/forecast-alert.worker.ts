import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "@/lib/redis";
import { FORECAST_ALERT_QUEUE, type ForecastAlertJob } from "@/lib/mei-oraculo/queue";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send";
import { formatMoney } from "@/lib/finance/format";
import { prisma } from "@/lib/db";

/**
 * Consome a fila `forecast-alert` (populada pelo job semanal do
 * MEI-Oráculo) e entrega o alerta de saldo negativo por WhatsApp. Sem este
 * worker o alerta ficava só na fila — o produto detectava o risco e nunca
 * avisava ninguém, que era o ponto inteiro do critério de aceite.
 *
 * Fica separado do worker do Gateway WhatsApp de propósito: são disparados
 * por fila diferente, cadência diferente (job semanal vs. mensagem em tempo
 * real) e uma falha aqui não pode derrubar o atendimento conversacional.
 * Rodar com `npm run worker:forecast-alert`.
 */
async function processJob(job: Job<ForecastAlertJob>): Promise<void> {
  const alert = job.data;

  const tenant = await prisma.tenant.findUnique({ where: { id: alert.tenantId } });
  if (!tenant) {
    throw new Error(`Tenant ${alert.tenantId} não encontrado ao tentar alertar.`);
  }

  const account = await prisma.account.findUnique({
    where: { tenantId_userId: { tenantId: alert.tenantId, userId: alert.userId } },
    select: { currency: true },
  });
  const currency = account?.currency ?? "BRL";

  const text =
    `⚠️ Alerta MonneyHub: no ritmo atual, projeto que seu saldo fica negativo em ` +
    `cerca de ${alert.crossesAtDay} dias (por volta de ` +
    `${formatMoney(alert.projectedBalance.toFixed(2), currency)}). ` +
    `Manda "previsão" pra ver a faixa completa.`;

  await sendWhatsAppTextMessage({
    phoneNumberId: tenant.whatsappPhoneNumberId,
    to: alert.userId,
    text,
  });

  console.info(
    `[forecast-alert] tenant=${alert.tenantId} user=${alert.userId} alertado ` +
      `(${alert.crossesAtDay}d, lead=${alert.leadDays}d)`,
  );
}

const worker = new Worker<ForecastAlertJob>(FORECAST_ALERT_QUEUE, processJob, {
  connection: getRedisConnection(),
  concurrency: 5,
});

worker.on("failed", (job, err) => {
  console.error(`[forecast-alert] job ${job?.id} falhou:`, err);
});

worker.on("ready", () => {
  console.info("[forecast-alert] worker pronto");
});
