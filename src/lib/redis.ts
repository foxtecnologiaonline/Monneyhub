import IORedis, { type Redis } from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

function createConnection(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL não configurada — necessária pra fila BullMQ do Gateway WhatsApp.");
  }
  // BullMQ exige maxRetriesPerRequest: null na conexão.
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export function getRedisConnection(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createConnection();
  }
  return globalForRedis.redis;
}
