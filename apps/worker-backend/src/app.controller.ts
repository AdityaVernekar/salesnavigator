import { Controller, Get } from "@nestjs/common";
import { env } from "@/lib/config/env";
import { WorkerLoopService } from "./worker-loop.service";

@Controller()
export class AppController {
  constructor(private readonly workerLoopService: WorkerLoopService) {}

  @Get("/health")
  health() {
    return { ok: true, service: "worker-backend", ts: new Date().toISOString() };
  }

  @Get("/status")
  status() {
    return {
      ok: true,
      executionMode: env.PIPELINE_EXECUTION_MODE,
      ...this.workerLoopService.getStatus(),
      ts: new Date().toISOString(),
    };
  }
}

