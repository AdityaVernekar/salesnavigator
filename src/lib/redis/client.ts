import Redis from "ioredis";
import { env } from "@/lib/config/env";

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (client) return client;
  if (!env.REDIS_HOST || !env.REDIS_PORT) {
    throw new Error("Redis host/port env is missing");
  }

  const tlsEnabled = env.REDIS_TLS_ENABLED.toLowerCase() === "true";

  client = new Redis({
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT),
    password: env.REDIS_PASSWORD || undefined,
    family: 4,
    tls: tlsEnabled ? { rejectUnauthorized: false } : undefined,
  });

  return client;
}

export async function pingRedis(): Promise<"PONG"> {
  const redis = getRedisClient();
  const pong = await redis.ping();
  if (pong !== "PONG") {
    throw new Error(`Unexpected Redis ping response: ${pong}`);
  }
  return pong;
}
