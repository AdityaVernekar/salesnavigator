import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";

export async function GET() {
  const owner = env.WORKER_EXECUTION_OWNER;
  const backendPort = Number(process.env.WORKER_BACKEND_PORT ?? "4010");
  return NextResponse.json({
    ok: true,
    owner,
    appKickMode: owner === "service" ? "advisory_only" : "active",
    workerService: {
      pollMs: Number(env.WORKER_SERVICE_POLL_MS),
      heartbeatMs: Number(env.WORKER_SERVICE_HEARTBEAT_MS),
      backendHealthUrl: `http://localhost:${backendPort}/health`,
      backendStatusUrl: `http://localhost:${backendPort}/status`,
    },
    rollback: "Set WORKER_EXECUTION_OWNER=app to restore app-owned kicks.",
  });
}

