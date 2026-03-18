import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { pingRedis } from "@/lib/redis/client";

function assertCronSecret(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    throw new Error("Unauthorized redis health request");
  }
}

export async function GET(request: NextRequest) {
  try {
    assertCronSecret(request);
    await pingRedis();

    return NextResponse.json({
      ok: true,
      redis: {
        host: env.REDIS_HOST,
        port: Number(env.REDIS_PORT),
        tlsEnabled: env.REDIS_TLS_ENABLED.toLowerCase() === "true",
        hasPassword: Boolean(env.REDIS_PASSWORD),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown redis health error";
    const isAuthError = message.toLowerCase().includes("unauthorized");
    return NextResponse.json({ ok: false, error: message }, { status: isAuthError ? 401 : 503 });
  }
}
