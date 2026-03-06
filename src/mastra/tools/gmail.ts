import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { sendEmailWithComposio, readInboxWithComposio } from "@/lib/composio/gmail";

export const gmailSendTool = createTool({
  id: "gmail-send",
  description: "Sends a Gmail message for a connected account via Composio.",
  inputSchema: z.object({
    accountId: z.string(),
    to: z.string(),
    subject: z.string(),
    bodyHtml: z.string(),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
    threadId: z.string().nullable(),
    raw: z.any(),
  }),
  execute: async (inputData) => {
    const result = await sendEmailWithComposio(
      inputData.accountId,
      inputData.to,
      inputData.subject,
      inputData.bodyHtml,
    );
    return {
      sent: true,
      threadId: result.threadId ?? null,
      raw: result,
    };
  },
});

export const gmailReadTool = createTool({
  id: "gmail-read",
  description: "Reads inbox/recent messages for a connected account via Composio.",
  inputSchema: z.object({
    accountId: z.string(),
    query: z.string(),
  }),
  outputSchema: z.object({
    messages: z.array(z.any()),
  }),
  execute: async (inputData) => {
    const messages = await readInboxWithComposio(inputData.accountId, inputData.query);
    return { messages };
  },
});
