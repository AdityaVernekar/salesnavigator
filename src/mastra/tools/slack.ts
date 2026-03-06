import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { env } from "@/lib/config/env";

export const slackNotifyTool = createTool({
  id: "slack-notify",
  description: "Sends a simple Slack notification to the configured webhook.",
  inputSchema: z.object({
    text: z.string(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
  }),
  execute: async (inputData) => {
    if (!env.SLACK_WEBHOOK_URL) {
      return { ok: false };
    }

    const res = await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: inputData.text }),
    });
    return { ok: res.ok };
  },
});
