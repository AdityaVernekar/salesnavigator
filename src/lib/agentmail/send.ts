import { getAgentMailClient } from "@/lib/agentmail/client";
import { supabaseServer } from "@/lib/supabase/server";

export async function sendEmailWithAgentMail(
  accountId: string,
  to: string,
  subject: string,
  bodyHtml: string,
  bodyText?: string,
  options?: { forceTextMode?: boolean; threadId?: string },
): Promise<{ threadId?: string; messageId?: string; raw: unknown; mode: "html" | "text" }> {
  const { data: account } = await supabaseServer
    .from("email_accounts")
    .select("agentmail_inbox_id")
    .eq("id", accountId)
    .single();

  if (!account?.agentmail_inbox_id) {
    throw new Error("Missing AgentMail inbox ID for account");
  }

  const client = getAgentMailClient();
  const inboxId = account.agentmail_inbox_id;
  const forceTextMode = Boolean(options?.forceTextMode);
  const replyThreadId = options?.threadId?.trim();

  if (replyThreadId) {
    const messagesResponse = await client.inboxes.messages.list(inboxId);
    const messages = Array.isArray(messagesResponse) ? messagesResponse : (messagesResponse as { messages?: unknown[] }).messages ?? [];
    const targetMessage = (messages as Array<{ threadId: string; messageId: string }>).find(
      (msg) => msg.threadId === replyThreadId,
    );

    if (targetMessage) {
      const response = await client.inboxes.messages.reply(inboxId, targetMessage.messageId, {
        text: forceTextMode ? (bodyText?.trim() || bodyHtml).trim() : undefined,
        html: forceTextMode ? undefined : bodyHtml,
      });
      return {
        threadId: response.threadId,
        messageId: response.messageId,
        raw: response,
        mode: forceTextMode ? "text" : "html",
      };
    }
  }

  const mode: "html" | "text" = forceTextMode ? "text" : "html";
  const response = await client.inboxes.messages.send(inboxId, {
    to: [to],
    subject,
    text: forceTextMode ? (bodyText?.trim() || bodyHtml).trim() : bodyText,
    html: forceTextMode ? undefined : bodyHtml,
  });

  return {
    threadId: response.threadId,
    messageId: response.messageId,
    raw: response,
    mode,
  };
}
