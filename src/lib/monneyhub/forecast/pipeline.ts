import {
  CreateDatasetImportJobCommand,
  CreateAutoPredictorCommand,
  CreateForecastCommand,
  DescribeAutoPredictorCommand,
  DescribeForecastCommand,
  GetAccuracyMetricsCommand,
} from "@aws-sdk/client-forecast";
import { DescribeDatasetImportJobCommand } from "@aws-sdk/client-forecast";
import { prisma } from "@/lib/db";
import { getForecastClient, uploadTrainingCsv } from "@/lib/monneyhub/forecast/aws";
import {
  aggregateDailyNetFlow,
  buildTargetTimeSeriesCsv,
  type ExportableTransaction,
} from "@/lib/monneyhub/forecast/export";
import { streamTransactionsForExport } from "@/lib/monneyhub/balance";
import { FORECAST_HORIZON_DAYS } from "@/lib/monneyhub/forecast/bands";
import type { ForecastPipeline } from "@prisma/client";

/**
 * Pipeline do Amazon Forecast, um estágio por tick. O dataset group, o
 * dataset e a role de acesso são infraestrutura (Terraform/console), não
 * runtime da aplicação — chegam por env.
 */

const QUANTILES = ["0.1", "0.5", "0.9"];

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurada.`);
  return value;
}

/** Estágio 0 — export do histórico pro S3 e criação do import job. */
export async function startWeeklyPipeline(): Promise<ForecastPipeline> {
  const all: ExportableTransaction[] = [];
  for await (const batch of streamTransactionsForExport()) {
    all.push(...batch);
  }

  const csv = buildTargetTimeSeriesCsv(aggregateDailyNetFlow(all));
  const key = `training/${new Date().toISOString().slice(0, 10)}/target-time-series.csv`;
  const s3Path = await uploadTrainingCsv(key, csv);

  const importJob = await getForecastClient().send(
    new CreateDatasetImportJobCommand({
      DatasetImportJobName: `monneyhub_import_${Date.now()}`,
      DatasetArn: requiredEnv("FORECAST_DATASET_ARN"),
      DataSource: {
        S3Config: { Path: s3Path, RoleArn: requiredEnv("FORECAST_ROLE_ARN") },
      },
      TimestampFormat: "yyyy-MM-dd",
    }),
  );

  return prisma.forecastPipeline.create({
    data: {
      stage: "IMPORTING",
      s3Path,
      importJobArn: importJob.DatasetImportJobArn,
    },
  });
}

/**
 * Avança o pipeline ativo em um estágio. Chamado por um tick frequente:
 * cada chamada consulta o recurso AWS corrente e só progride quando ele
 * ficou ACTIVE. Devolve o estágio resultante.
 */
export async function advancePipeline(pipeline: ForecastPipeline): Promise<ForecastPipeline> {
  const forecast = getForecastClient();

  try {
    switch (pipeline.stage) {
      case "IMPORTING": {
        const job = await forecast.send(
          new DescribeDatasetImportJobCommand({
            DatasetImportJobArn: pipeline.importJobArn!,
          }),
        );
        if (job.Status !== "ACTIVE") return assertNotFailed(pipeline, job.Status, job.Message);

        const predictor = await forecast.send(
          new CreateAutoPredictorCommand({
            PredictorName: `monneyhub_predictor_${Date.now()}`,
            ForecastHorizon: FORECAST_HORIZON_DAYS,
            ForecastFrequency: "D",
            ForecastTypes: QUANTILES,
            DataConfig: { DatasetGroupArn: requiredEnv("FORECAST_DATASET_GROUP_ARN") },
          }),
        );

        return update(pipeline.id, {
          stage: "TRAINING",
          predictorArn: predictor.PredictorArn,
        });
      }

      case "TRAINING": {
        const predictor = await forecast.send(
          new DescribeAutoPredictorCommand({ PredictorArn: pipeline.predictorArn! }),
        );
        if (predictor.Status !== "ACTIVE") {
          return assertNotFailed(pipeline, predictor.Status, predictor.Message);
        }

        const created = await forecast.send(
          new CreateForecastCommand({
            ForecastName: `monneyhub_forecast_${Date.now()}`,
            PredictorArn: pipeline.predictorArn!,
            ForecastTypes: QUANTILES,
          }),
        );

        return update(pipeline.id, { stage: "FORECASTING", forecastArn: created.ForecastArn });
      }

      case "FORECASTING": {
        const created = await forecast.send(
          new DescribeForecastCommand({ ForecastArn: pipeline.forecastArn! }),
        );
        if (created.Status !== "ACTIVE") {
          return assertNotFailed(pipeline, created.Status, created.Message);
        }

        return update(pipeline.id, { stage: "QUERYING" });
      }

      default:
        return pipeline;
    }
  } catch (err) {
    return update(pipeline.id, {
      stage: "FAILED",
      failureReason: err instanceof Error ? err.message : String(err),
      finishedAt: new Date(),
    });
  }
}

/** Status AWS terminam em _FAILED quando dão errado; qualquer outro é "ainda rodando". */
function assertNotFailed(
  pipeline: ForecastPipeline,
  status: string | undefined,
  message: string | undefined,
): Promise<ForecastPipeline> {
  if (status?.endsWith("FAILED")) {
    return update(pipeline.id, {
      stage: "FAILED",
      failureReason: message ?? status,
      finishedAt: new Date(),
    });
  }
  return Promise.resolve(pipeline);
}

function update(
  id: string,
  data: Parameters<typeof prisma.forecastPipeline.update>[0]["data"],
): Promise<ForecastPipeline> {
  return prisma.forecastPipeline.update({ where: { id }, data });
}

export async function getActivePipeline(): Promise<ForecastPipeline | null> {
  return prisma.forecastPipeline.findFirst({
    where: { stage: { in: ["IMPORTING", "TRAINING", "FORECASTING", "QUERYING"] } },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * MAPE do preditor, medido pelo próprio backtest do Forecast. Exposto
 * internamente por exigência do escopo — não prometer precisão sem medir.
 */
export async function fetchPredictorMape(predictorArn: string): Promise<number | null> {
  const metrics = await getForecastClient().send(
    new GetAccuracyMetricsCommand({ PredictorArn: predictorArn }),
  );

  const windows = metrics.PredictorEvaluationResults?.flatMap(
    (result) => result.TestWindows ?? [],
  );
  const mape = windows?.find((window) => window.Metrics?.ErrorMetrics?.[0]?.MAPE !== undefined);

  return mape?.Metrics?.ErrorMetrics?.[0]?.MAPE ?? null;
}
