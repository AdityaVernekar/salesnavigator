import { Memory } from "@mastra/memory";

export function createAgentMemory() {
  return new Memory({
    options: {
      lastMessages: 20,
      workingMemory: {
        enabled: true,
      },
    },
  });
}
