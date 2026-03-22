import { getAgentMailClient } from "@/lib/agentmail/client";
import { supabaseServer } from "@/lib/supabase/server";

export async function listAgentMailMessages(accountId: string) {
  const { data: account } = await supabaseServer
    .from("email_accounts")
    .select("agentmail_inbox_id")
    .eq("id", accountId)
    .single();

  if (!account?.agentmail_inbox_id) {
    throw new Error("Missing AgentMail inbox ID for account");
  }

  const client = getAgentMailClient();
  const response = await client.inboxes.messages.list(account.agentmail_inbox_id);
  return response;
}

export async function getAgentMailMessage(accountId: string, messageId: string) {
  const { data: account } = await supabaseServer
    .from("email_accounts")
    .select("agentmail_inbox_id")
    .eq("id", accountId)
    .single();

  if (!account?.agentmail_inbox_id) {
    throw new Error("Missing AgentMail inbox ID for account");
  }

  const client = getAgentMailClient();
  const response = await client.inboxes.messages.get(account.agentmail_inbox_id, messageId);
  return response;
}
