import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { DailyNet } from "@/lib/mei-oraculo/series";

const CSV_HEADER = "item_id,timestamp,target_value";

let client: S3Client | undefined;

export function isExportConfigured(): boolean {
  return Boolean(process.env.FORECAST_EXPORT_BUCKET);
}

/**
 * TARGET_TIME_SERIES do Amazon Forecast: item_id, timestamp (yyyy-MM-dd) e
 * target_value, sem cabeçalho na ingestão real — mantemos o header porque o
 * mesmo arquivo é lido por humano e por ferramenta de análise. O consumidor
 * decide se descarta a primeira linha.
 */
export function toForecastCsv(itemId: string, series: DailyNet[]): string {
  const lines = series.map((point) => {
    const timestamp = point.date.toISOString().slice(0, 10);
    return `${itemId},${timestamp},${point.net.toFixed(2)}`;
  });
  return [CSV_HEADER, ...lines].join("\n");
}

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      // endpoint custom cobre R2 e qualquer S3-compatível — a stack FOX
      // prevê os dois, então a escolha fica em configuração.
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  }
  return client;
}

export function buildExportKey(tenantId: string, userId: string, runAt: Date): string {
  return `forecast/${tenantId}/${userId}/${runAt.toISOString().slice(0, 10)}.csv`;
}

/** Sobe o histórico exportado. Devolve a key gravada, ou null se não configurado. */
export async function uploadForecastSeries(params: {
  tenantId: string;
  userId: string;
  series: DailyNet[];
  runAt?: Date;
}): Promise<string | null> {
  const bucket = process.env.FORECAST_EXPORT_BUCKET;
  if (!bucket) return null;

  const runAt = params.runAt ?? new Date();
  const key = buildExportKey(params.tenantId, params.userId, runAt);
  const itemId = `${params.tenantId}:${params.userId}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: toForecastCsv(itemId, params.series),
      ContentType: "text/csv",
    }),
  );

  return key;
}
