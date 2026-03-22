import { getAgentMailClient } from "@/lib/agentmail/client";
import { supabaseServer } from "@/lib/supabase/server";

export async function createAgentMailInbox(params: {
  companyId: string;
  displayName?: string;
  username?: string;
  domain?: string;
}) {
  const client = getAgentMailClient();

  let inbox;
  try {
    inbox = await client.inboxes.create({
      username: params.username,
      domain: params.domain,
      displayName: params.displayName,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("AlreadyExistsError") || message.includes("already exists")) {
      // Inbox already exists in AgentMail — find it and link it
      const targetEmail = params.username
        ? `${params.username}@${params.domain || "agentmail.to"}`
        : null;

      if (!targetEmail) {
        throw new Error("Inbox already exists. Provide a username to link the existing inbox.");
      }

      // Check if we already have this inbox in our DB
      const { data: existingAccount } = await supabaseServer
        .from("email_accounts")
        .select("*")
        .eq("company_id", params.companyId)
        .eq("gmail_address", targetEmail)
        .eq("provider", "agentmail")
        .maybeSingle();

      if (existingAccount) {
        throw new Error(`Inbox ${targetEmail} is already connected`);
      }

      // Fetch from AgentMail API to get the inbox details
      const found = await findAgentMailInboxByEmail(targetEmail);
      if (found) {
        inbox = found;
      } else {
        throw new Error(`Inbox already exists in AgentMail but could not be retrieved. Try a different username.`);
      }
    } else {
      throw err;
    }
  }

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

/** List all inboxes from the AgentMail API (not DB) */
export async function fetchRemoteAgentMailInboxes() {
  const client = getAgentMailClient();
  const allInboxes: Array<{
    inboxId: string;
    email: string;
    displayName?: string;
    createdAt?: string | Date;
  }> = [];

  let pageToken: string | undefined;
  do {
    const res = await client.inboxes.list({
      limit: 100,
      pageToken,
    });
    if (res.inboxes) {
      allInboxes.push(...res.inboxes);
    }
    pageToken = res.nextPageToken ?? undefined;
  } while (pageToken);

  return allInboxes;
}

/** Find a specific inbox by email from AgentMail API */
async function findAgentMailInboxByEmail(email: string) {
  const inboxes = await fetchRemoteAgentMailInboxes();
  return inboxes.find((i) => i.email === email) ?? null;
}

/** Sync remote AgentMail inboxes into the local DB for a company */
export async function syncAgentMailInboxes(companyId: string) {
  const remoteInboxes = await fetchRemoteAgentMailInboxes();

  // Get existing DB records
  const { data: existingAccounts } = await supabaseServer
    .from("email_accounts")
    .select("gmail_address, agentmail_inbox_id")
    .eq("company_id", companyId)
    .eq("provider", "agentmail");

  const existingEmails = new Set(
    (existingAccounts ?? []).map((a) => a.gmail_address),
  );

  // Insert any remote inboxes not yet in DB
  const newInboxes = remoteInboxes.filter((i) => !existingEmails.has(i.email));

  if (newInboxes.length === 0) {
    return { imported: 0, total: remoteInboxes.length };
  }

  const { error } = await supabaseServer.from("email_accounts").insert(
    newInboxes.map((inbox) => ({
      company_id: companyId,
      gmail_address: inbox.email,
      display_name: inbox.displayName ?? null,
      provider: "agentmail",
      agentmail_inbox_id: inbox.inboxId,
      is_active: true,
      connection_status: "connected",
      daily_limit: 500,
      sends_today: 0,
    })),
  );

  if (error) throw new Error(`Failed to sync inboxes: ${error.message}`);

  return { imported: newInboxes.length, total: remoteInboxes.length };
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
  try {
    await client.inboxes.delete(account.agentmail_inbox_id);
  } catch {
    // Inbox may already be deleted from AgentMail — continue with DB cleanup
  }

  await supabaseServer
    .from("email_accounts")
    .delete()
    .eq("id", accountId)
    .eq("company_id", companyId);
}
