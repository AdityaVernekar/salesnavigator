import "dotenv/config";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("WorkerBackendBootstrap");
  const port = Number(process.env.WORKER_BACKEND_PORT ?? "4010");
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });
  app.enableShutdownHooks();
  await app.listen(port, "0.0.0.0");
  logger.log(`Nest worker backend listening on :${port}`);
}

void bootstrap().catch((error) => {
  const logger = new Logger("WorkerBackendBootstrap");
  logger.error("Failed to start worker backend", error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

