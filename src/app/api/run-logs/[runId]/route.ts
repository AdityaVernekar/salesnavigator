import { requireRouteContext } from "@/lib/auth/route-context";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let lastSeenId = 0;
      let interval: ReturnType<typeof setInterval> | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const close = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Ignore invalid-state close races on disconnected clients.
        }
      };

      const sendEvent = (payload: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Client disconnected while polling; stop timers and stream.
          close();
        }
      };

      const poll = async () => {
        if (closed) return;
        const [{ data: snapshotLogs }, { data: runStatus }] = await Promise.all([
          supabase
            .from("run_logs")
            .select("id,agent_type,level,message,metadata,ts")
            .eq("company_id", companyId)
            .eq("run_id", runId)
            .order("id", { ascending: false })
            .limit(50),
          supabase
            .from("pipeline_runs")
            .select("status,current_stage")
            .eq("company_id", companyId)
            .eq("id", runId)
            .single(),
        ]);
        const logs = (snapshotLogs ?? []).reverse();
        if (logs.length) {
          lastSeenId = Number(logs[logs.length - 1]?.id ?? 0);
        }
        sendEvent({
          type: "snapshot",
          runId,
          logs,
          runStatus: {
            status: runStatus?.status ?? null,
            currentStage: runStatus?.current_stage ?? null,
          },
          mode: "sse",
        });
      };

      interval = setInterval(async () => {
        if (closed) return;
        try {
          const [{ data: newLogs }, { data: runStatus }] = await Promise.all([
            supabase
              .from("run_logs")
              .select("id,agent_type,level,message,metadata,ts")
              .eq("company_id", companyId)
              .eq("run_id", runId)
              .gt("id", lastSeenId)
              .order("id", { ascending: true })
              .limit(20),
            supabase
              .from("pipeline_runs")
              .select("status,current_stage")
              .eq("company_id", companyId)
              .eq("id", runId)
              .single(),
          ]);

          for (const log of newLogs ?? []) {
            lastSeenId = Math.max(lastSeenId, Number(log.id));
            sendEvent({
              type: "log",
              runId,
              log,
            });
          }

          sendEvent({
            type: "status",
            runId,
            status: runStatus?.status ?? null,
            currentStage: runStatus?.current_stage ?? null,
          });
        } catch (error) {
          if (closed) return;
          sendEvent({
            type: "error",
            runId,
            message: error instanceof Error ? error.message : "Live stream polling failed",
          });
        }
      }, 1500);

      void poll().catch((error) => {
        sendEvent({
          type: "error",
          runId,
          message: error instanceof Error ? error.message : "Failed to poll run logs",
        });
      });

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          close();
        }
      }, 10000);

      _request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
