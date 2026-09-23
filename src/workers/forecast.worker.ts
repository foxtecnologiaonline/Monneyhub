import { Queue, Worker, type Job } from "bullmq";
import { getRedisConnection } from "@/lib/redis";
import { prisma } from "@/lib/db";
import {
  startWeeklyPipeline,
  advancePipeline,
  getActivePipeline,
  fetchPredictorMape,
} from "@/lib/monneyhub/forecast/pipeline";
import { materializeRuns } from "@/lib/monneyhub/forecast/runs";

/**
 * MEI-Oráculo. Dois jobs repetíveis na mesma fila:
 * - `weekly-training`: abre o pipeline da semana (export → S3 → import).
 * - `tick`: avança um estágio por vez; import/treino/geração levam horas,
 *   então não dá pra bloquear um job esperando.
 * Rodar com `npm run worker:forecast`.
 */

const QUEUE_NAME = "forecast-pipeline";
const TICK_INTERVAL_MS = 15 * 60 * 1000;

async function runTick(): Promise<void> {
  const pipeline = await getActivePipeline();
  if (!pipeline) return;

  if (pipeline.stage !== "QUERYING") {
    const advanced = await advancePipeline(pipeline);
    console.info(`[forecast] pipeline ${pipeline.id}: ${pipeline.stage} → ${advanced.stage}`);
    return;
  }

  const mape = pipeline.predictorArn ? await fetchPredictorMape(pipeline.predictorArn) : null;
  const result = await materializeRuns(pipeline, mape);

  await prisma.forecastPipeline.update({
    where: { id: pipeline.id },
    data: { stage: "DONE", finishedAt: new Date() },
  });

  console.info(
    `[forecast] pipeline ${pipeline.id} concluído: ${result.ready} previsões, ` +
      `${result.awaitingData} aguardando dado, ${result.alerts} alertas, mape=${mape ?? "n/d"}`,
  );
}

async function processJob(job: Job): Promise<void> {
  if (job.name === "weekly-training") {
    const active = await getActivePipeline();
    if (active) {
      console.warn(`[forecast] pipeline ${active.id} ainda em ${active.stage}; pulando semana.`);
      return;
    }
    const pipeline = await startWeeklyPipeline();
    console.info(`[forecast] pipeline ${pipeline.id} iniciado (${pipeline.s3Path})`);
    return;
  }

  await runTick();
}

async function main(): Promise<void> {
  const connection = getRedisConnection();

  const worker = new Worker(QUEUE_NAME, processJob, { connection, concurrency: 1 });
  worker.on("failed", (job, err) => {
    console.error(`[forecast] job ${job?.name} falhou:`, err);
  });

  const queue = new Queue(QUEUE_NAME, { connection });
  await queue.upsertJobScheduler(
    "weekly-training",
    { pattern: "0 3 * * 1" }, // segunda-feira, 03:00
    { name: "weekly-training" },
  );
  await queue.upsertJobScheduler("tick", { every: TICK_INTERVAL_MS }, { name: "tick" });

  console.info("[forecast] worker pronto (treino semanal + tick de 15min)");
}

main().catch((err) => {
  console.error("[forecast] worker não subiu:", err);
  process.exit(1);
});
