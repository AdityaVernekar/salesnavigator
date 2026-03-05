import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { processNextPipelineJob } from "@/lib/pipeline/worker";

function assertWorkerSecret(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    throw new Error("Unauthorized worker request");
  }
}

export async function POST(request: NextRequest) {
  try {
    assertWorkerSecret(request);
    const result = await processNextPipelineJob();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline worker failed";
    const status = message.toLowerCase().includes("unauthorized") ? 401 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status },
    );
  }
}
