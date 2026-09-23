import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ForecastClient } from "@aws-sdk/client-forecast";
import { ForecastqueryClient } from "@aws-sdk/client-forecastquery";

/** Clients AWS compartilhados — credenciais pela cadeia padrão do SDK. */

let s3: S3Client | undefined;
let forecast: ForecastClient | undefined;
let forecastQuery: ForecastqueryClient | undefined;

function region(): string {
  const value = process.env.AWS_REGION;
  if (!value) throw new Error("AWS_REGION não configurada.");
  return value;
}

export function getS3Client(): S3Client {
  if (!s3) s3 = new S3Client({ region: region() });
  return s3;
}

export function getForecastClient(): ForecastClient {
  if (!forecast) forecast = new ForecastClient({ region: region() });
  return forecast;
}

export function getForecastQueryClient(): ForecastqueryClient {
  if (!forecastQuery) forecastQuery = new ForecastqueryClient({ region: region() });
  return forecastQuery;
}

export function forecastBucket(): string {
  const bucket = process.env.FORECAST_S3_BUCKET;
  if (!bucket) throw new Error("FORECAST_S3_BUCKET não configurado.");
  return bucket;
}

/** Sobe o CSV de treino e devolve o caminho s3:// que o Forecast vai importar. */
export async function uploadTrainingCsv(key: string, csv: string): Promise<string> {
  const bucket = forecastBucket();

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: csv,
      ContentType: "text/csv",
      ServerSideEncryption: "AES256",
    }),
  );

  return `s3://${bucket}/${key}`;
}
