import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { buildRuntimeAgent } from "@/lib/agents/build-runtime-agent";

const followUpInput = z.object({
  campaignIds: z.array(z.string().uuid()).default([]),
});

const pollRepliesStep = createStep({
  id: "poll-replies-step",
  inputSchema: followUpInput,
  outputSchema: z.object({
    campaignIds: z.array(z.string().uuid()),
    repliesProcessed: z.number(),
    configVersionId: z.string().nullable(),
    toolsEnabled: z.array(z.string()),
    toolsRejected: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const followUpRuntime = await buildRuntimeAgent("followup");
    const result = await followUpRuntime.agent.generate(
      followUpRuntime.preparePrompt(
        `Process new replies for campaigns: ${JSON.stringify(inputData.campaignIds)}`,
      ),
    );
    return {
      campaignIds: inputData.campaignIds,
      repliesProcessed: result.text ? 1 : 0,
      configVersionId: followUpRuntime.config.configVersionId,
      toolsEnabled: followUpRuntime.toolKeys,
      toolsRejected: followUpRuntime.rejectedToolKeys,
    };
  },
});

const sendDueStep = createStep({
  id: "send-due-followups-step",
  inputSchema: z.object({
    campaignIds: z.array(z.string().uuid()),
    repliesProcessed: z.number(),
    configVersionId: z.string().nullable(),
    toolsEnabled: z.array(z.string()),
    toolsRejected: z.array(z.string()),
  }),
  outputSchema: z.object({
    repliesProcessed: z.number(),
    followupsSent: z.number(),
    configVersionId: z.string().nullable(),
    toolsEnabled: z.array(z.string()),
    toolsRejected: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    return {
      repliesProcessed: inputData.repliesProcessed,
      followupsSent: 0,
      configVersionId: inputData.configVersionId,
      toolsEnabled: inputData.toolsEnabled,
      toolsRejected: inputData.toolsRejected,
    };
  },
});

export const followUpWorkflow = createWorkflow({
  id: "follow-up-workflow",
  inputSchema: followUpInput,
  outputSchema: z.object({
    repliesProcessed: z.number(),
    followupsSent: z.number(),
    configVersionId: z.string().nullable(),
    toolsEnabled: z.array(z.string()),
    toolsRejected: z.array(z.string()),
  }),
})
  .then(pollRepliesStep)
  .then(sendDueStep)
  .commit();
