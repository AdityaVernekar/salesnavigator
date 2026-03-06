import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { DEFAULT_LLM_MODEL } from "@/lib/ai/default-model";
import { createAgentMemory } from "@/mastra/memory";

const warmupAgent = new Agent({
  id: "warmup-agent",
  name: "Warmup Agent",
  description: "Generates natural non-sales warmup emails between accounts.",
  model: DEFAULT_LLM_MODEL,
  memory: createAgentMemory(),
  tools: {},
  instructions: `Generate short natural emails between coworkers.
Never make it salesy.
Topics: schedule changes, quick updates, clarifications.
Length: 30-80 words.`,
});

const warmupSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

export async function generateWarmupEmail() {
  const result = await warmupAgent.generate("Create one warmup email.", {
    structuredOutput: { schema: warmupSchema },
  });
  return result.object;
}
