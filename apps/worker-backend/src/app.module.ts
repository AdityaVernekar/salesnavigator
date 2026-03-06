import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { WorkerLoopService } from "./worker-loop.service";

@Module({
  controllers: [AppController],
  providers: [WorkerLoopService],
})
export class AppModule {}

