import { getAgentMailClient } from "@/lib/agentmail/client";
import { supabaseServer } from "@/lib/supabase/server";

export async function createAgentMailInbox(params: {
  companyId: string;
  displayName?: string;
  username?: string;
  domain?: string;
}) {
  const client = getAgentMailClient();

  const inbox = await client.inboxes.create({
    username: params.username,
    domain: params.domain,
    displayName: params.displayName,
  });

  const { data: account, error } = await supabaseServer
    .from("email_accounts")
    .insert({
      company_id: params.companyId,
      gmail_address: inbox.email,
      display_name: inbox.displayName ?? params.displayName ?? null,
      provider: "agentmail",
      agentmail_inbox_id: inbox.inboxId,
      is_active: true,
      connection_status: "connected",
      daily_limit: 500,
      sends_today: 0,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to save AgentMail inbox: ${error.message}`);

  return { inbox, account };
}

export async function listAgentMailInboxes(companyId: string) {
  const { data, error } = await supabaseServer
    .from("email_accounts")
    .select("*")
    .eq("company_id", companyId)
    .eq("provider", "agentmail")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function deleteAgentMailInbox(accountId: string, companyId: string) {
  const { data: account } = await supabaseServer
    .from("email_accounts")
    .select("agentmail_inbox_id")
    .eq("id", accountId)
    .eq("company_id", companyId)
    .eq("provider", "agentmail")
    .single();

  if (!account?.agentmail_inbox_id) {
    throw new Error("AgentMail inbox not found");
  }

  const client = getAgentMailClient();
  await client.inboxes.delete(account.agentmail_inbox_id);

  await supabaseServer
    .from("email_accounts")
    .update({ is_active: false, connection_status: "disconnected" })
    .eq("id", accountId)
    .eq("company_id", companyId);
}
