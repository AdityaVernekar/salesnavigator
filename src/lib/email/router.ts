import { supabaseServer } from "@/lib/supabase/server";
import { sendEmailWithComposio } from "@/lib/composio/gmail";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/config/env";

const MAILBOX_TOKEN_WINDOW_SECONDS = 60;
const MAILBOX_DEFAULT_PER_MINUTE = 20;
const MAILBOX_TOKEN_KEY_PREFIX = "mailbox:send-tokens:v1";

let redisClient: Redis | null = null;

function getRedisClient() {
  if (redisClient) return redisClient;
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("Upstash Redis env is missing");
  }
  redisClient = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redisClient;
}

async function consumeMailboxToken(accountId: string, limitPerMinute = MAILBOX_DEFAULT_PER_MINUTE) {
  const redis = getRedisClient();
  const bucketKey = `${MAILBOX_TOKEN_KEY_PREFIX}:${accountId}:${new Date().toISOString().slice(0, 16)}`;
  const next = Number(await redis.incr(bucketKey));
  if (next === 1) {
    await redis.expire(bucketKey, MAILBOX_TOKEN_WINDOW_SECONDS);
  }
  if (next > limitPerMinute) {
    throw new Error(`Mailbox ${accountId} throttled (${limitPerMinute}/min cap)`);
  }
}

async function isSuppressedRecipient(campaignId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  const { data: previous } = await supabaseServer
    .from("emails_sent")
    .select("id,bounced,classification,replied_at")
    .eq("campaign_id", campaignId)
    .ilike("to_email", normalized)
    .order("sent_at", { ascending: false })
    .limit(10);

  if (!previous?.length) return false;
  return previous.some((entry) => {
    if (entry.bounced) return true;
    if (entry.replied_at) return true;
    const cls = String(entry.classification ?? "").toLowerCase();
    return cls === "unsubscribe" || cls === "negative_reply" || cls === "do_not_contact";
  });
}

function hashValue(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export async function selectSendingAccount(
  campaignId: string,
  options?: { contactId?: string; preferredAccountId?: string | null },
) {
  const { data: campaign, error } = await supabaseServer
    .from("campaigns")
    .select("account_ids,mailbox_selection_mode,primary_account_id")
    .eq("id", campaignId)
    .single();

  if (error || !campaign?.account_ids?.length) {
    throw new Error("No sending accounts configured for campaign");
  }

  const { data: accounts } = await supabaseServer
    .from("email_accounts")
    .select("*")
    .in("id", campaign.account_ids)
    .eq("is_active", true)
    .eq("connection_status", "connected");

  if (!accounts?.length) {
    throw new Error("No active account available");
  }

  const eligibleAccounts = accounts.filter((item) => (item.sends_today ?? 0) < (item.daily_limit ?? 0));
  if (!eligibleAccounts.length) {
    throw new Error("All configured mailboxes have reached their daily limit");
  }

  if (options?.preferredAccountId) {
    const preferred = eligibleAccounts.find((item) => item.id === options.preferredAccountId);
    if (preferred) return preferred;
  }

  const mode = campaign.mailbox_selection_mode ?? "least_loaded";
  let account = eligibleAccounts[0];
  const accountIds = eligibleAccounts.map((item) => item.id);
  const { data: campaignDistribution } = await supabaseServer
    .from("emails_sent")
    .select("account_id")
    .eq("campaign_id", campaignId)
    .in("account_id", accountIds);
  const distribution = new Map<string, number>();
  for (const row of campaignDistribution ?? []) {
    const accountId = String(row.account_id ?? "");
    if (!accountId) continue;
    distribution.set(accountId, (distribution.get(accountId) ?? 0) + 1);
  }
  if (mode === "explicit_single") {
    account =
      eligibleAccounts.find((item) => item.id === campaign.primary_account_id) ??
      (() => {
        throw new Error("Primary mailbox is not available for this campaign");
      })();
  } else if (mode === "round_robin") {
    const seed = options?.contactId ?? `${campaignId}:${new Date().toISOString().slice(0, 10)}`;
    account = eligibleAccounts[hashValue(seed) % eligibleAccounts.length];
  } else {
    account = eligibleAccounts
      .slice()
      .sort((a, b) => {
        const aCampaignPressure = distribution.get(a.id) ?? 0;
        const bCampaignPressure = distribution.get(b.id) ?? 0;
        if (aCampaignPressure !== bCampaignPressure) {
          return aCampaignPressure - bCampaignPressure;
        }
        return (a.sends_today ?? 0) - (b.sends_today ?? 0);
      })[0];
  }

  if (account.sends_today >= account.daily_limit) {
    throw new Error("Selected account has reached daily limit");
  }

  return account;
}

export async function sendViaComposio(params: {
  campaignId: string;
  to: string;
  subject: string;
  bodyHtml: string;
}) {
  const suppressed = await isSuppressedRecipient(params.campaignId, params.to);
  if (suppressed) {
    throw new Error(`Recipient suppressed for campaign: ${params.to}`);
  }
  const account = await selectSendingAccount(params.campaignId);
  await consumeMailboxToken(account.id);
  const result = await sendEmailWithComposio(account.id, params.to, params.subject, params.bodyHtml);

  await supabaseServer.from("email_accounts").update({ sends_today: account.sends_today + 1 }).eq("id", account.id);

  return { account, result };
}
