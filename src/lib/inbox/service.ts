import { readInboxWithComposio } from "@/lib/composio/gmail";
import { supabaseServer } from "@/lib/supabase/server";

export type InboxView = "sent" | "replies";

export type InboxQuery = {
  companyId?: string;
  view: InboxView;
  campaignId?: string;
  limit: number;
  cursor?: string;
};

export type InboxItem = {
  id: string;
  campaignId: string | null;
  campaignName: string;
  contactId: string | null;
  contactName: string;
  contactEmail: string;
  companyName: string;
  enrollmentId: string | null;
  enrollmentStatus: string;
  threadId: string;
  toEmail: string;
  originalToEmail: string;
  subject: string;
  classification: string;
  sentAt: string;
  repliedAt: string | null;
  lastReplyAt: string | null;
  replyFromEmail: string | null;
  replySnippet: string | null;
  isTestSend: boolean;
  renderMode: string;
};

export type LeadEmailActivityItem = {
  id: string;
  contactId: string | null;
  contactName: string;
  contactEmail: string;
  companyName: string;
  enrollmentId: string | null;
  enrollmentStatus: string;
  enrollmentStep: number | null;
  nextStepAt: string | null;
  accountId: string | null;
  accountAddress: string;
  threadId: string;
  toEmail: string;
  originalToEmail: string;
  subject: string;
  classification: string;
  sentAt: string;
  repliedAt: string | null;
  lastReplyAt: string | null;
  replyFromEmail: string | null;
  replySnippet: string | null;
  templateVersionId: string | null;
  isTestSend: boolean;
  renderMode: string;
};

type SupabaseLeadEmailRow = {
  id: string;
  contact_id: string | null;
  contact?:
    | { name: string | null; email: string | null; company_name: string | null }
    | Array<{ name: string | null; email: string | null; company_name: string | null }>
    | null;
  enrollment_id: string | null;
  enrollment?:
    | { status: string | null; current_step: number | null; next_step_at: string | null }
    | Array<{ status: string | null; current_step: number | null; next_step_at: string | null }>
    | null;
  account_id: string | null;
  account?: { gmail_address: string | null } | Array<{ gmail_address: string | null }> | null;
  gmail_thread_id: string | null;
  to_email: string | null;
  original_to_email: string | null;
  subject: string | null;
  classification: string | null;
  sent_at: string | null;
  replied_at: string | null;
  last_reply_at: string | null;
  reply_from_email: string | null;
  reply_snippet: string | null;
  template_version_id: string | null;
  is_test_send: boolean | null;
  render_mode: string | null;
};

type SupabaseInboxRow = {
  id: string;
  campaign_id: string | null;
  campaign?: { name: string | null } | Array<{ name: string | null }> | null;
  contact_id: string | null;
  contact?:
    | { name: string | null; email: string | null; company_name: string | null }
    | Array<{ name: string | null; email: string | null; company_name: string | null }>
    | null;
  enrollment_id: string | null;
  enrollment?: { status: string | null } | Array<{ status: string | null }> | null;
  gmail_thread_id: string | null;
  to_email: string | null;
  original_to_email: string | null;
  subject: string | null;
  classification: string | null;
  sent_at: string | null;
  replied_at: string | null;
  last_reply_at: string | null;
  reply_from_email: string | null;
  reply_snippet: string | null;
  is_test_send: boolean | null;
  render_mode: string | null;
};

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function listLeadEmailActivity(input: {
  companyId: string;
  leadId: string;
  limit?: number;
}): Promise<LeadEmailActivityItem[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const { data: leadContacts, error: leadContactsError } = await supabaseServer
    .from("contacts")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("lead_id", input.leadId)
    .limit(1000);
  if (leadContactsError) throw new Error(leadContactsError.message);

  const contactIds = (leadContacts ?? []).map((item) => item.id);
  if (!contactIds.length) return [];

  const { data, error } = await supabaseServer
    .from("emails_sent")
    .select(
      "id,contact_id,contact:contacts(name,email,company_name),enrollment_id,enrollment:enrollments(status,current_step,next_step_at),account_id,account:email_accounts(gmail_address),gmail_thread_id,to_email,original_to_email,subject,classification,sent_at,replied_at,last_reply_at,reply_from_email,reply_snippet,template_version_id,is_test_send,render_mode",
    )
    .eq("company_id", input.companyId)
    .in("contact_id", contactIds)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as SupabaseLeadEmailRow[];
  return rows.map((row) => {
    const contact = unwrapRelation(row.contact);
    const enrollment = unwrapRelation(row.enrollment);
    const account = unwrapRelation(row.account);
    return {
      id: row.id,
      contactId: row.contact_id,
      contactName: contact?.name ?? "",
      contactEmail: contact?.email ?? "",
      companyName: contact?.company_name ?? "",
      enrollmentId: row.enrollment_id,
      enrollmentStatus: enrollment?.status ?? "unknown",
      enrollmentStep: enrollment?.current_step ?? null,
      nextStepAt: enrollment?.next_step_at ?? null,
      accountId: row.account_id,
      accountAddress: account?.gmail_address ?? "",
      threadId: row.gmail_thread_id ?? "",
      toEmail: row.to_email ?? "",
      originalToEmail: row.original_to_email ?? "",
      subject: row.subject ?? "",
      classification: row.classification ?? "UNCLASSIFIED",
      sentAt: row.sent_at ?? "",
      repliedAt: row.replied_at,
      lastReplyAt: row.last_reply_at,
      replyFromEmail: row.reply_from_email,
      replySnippet: row.reply_snippet,
      templateVersionId: row.template_version_id,
      isTestSend: Boolean(row.is_test_send),
      renderMode: row.render_mode ?? "unknown",
    };
  });
}

export async function listInboxItems(query: InboxQuery): Promise<{ items: InboxItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(query.limit, 1), 100);
  let request = supabaseServer
    .from("emails_sent")
    .select(
      "id,campaign_id,campaign:campaigns(name),contact_id,contact:contacts(name,email,company_name),enrollment_id,enrollment:enrollments(status),gmail_thread_id,to_email,original_to_email,subject,classification,sent_at,replied_at,last_reply_at,reply_from_email,reply_snippet,is_test_send,render_mode",
    )
    .order("sent_at", { ascending: false })
    .limit(limit + 1);

  if (query.companyId) {
    request = request.eq("company_id", query.companyId);
  }
  if (query.view === "replies") {
    request = request.not("replied_at", "is", null);
  }
  if (query.campaignId) {
    request = request.eq("campaign_id", query.campaignId);
  }
  if (query.cursor) {
    request = request.lt("sent_at", query.cursor);
  }

  const { data, error } = await request;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as SupabaseInboxRow[];
  const paged = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? (paged[paged.length - 1]?.sent_at ?? null) : null;

  return {
    items: paged.map((row) => {
      const campaign = unwrapRelation(row.campaign);
      const contact = unwrapRelation(row.contact);
      const enrollment = unwrapRelation(row.enrollment);

      return {
        id: row.id,
        campaignId: row.campaign_id,
        campaignName: campaign?.name ?? "Unknown campaign",
        contactId: row.contact_id,
        contactName: contact?.name ?? "",
        contactEmail: contact?.email ?? "",
        companyName: contact?.company_name ?? "",
        enrollmentId: row.enrollment_id,
        enrollmentStatus: enrollment?.status ?? "unknown",
        threadId: row.gmail_thread_id ?? "",
        toEmail: row.to_email ?? "",
        originalToEmail: row.original_to_email ?? "",
        subject: row.subject ?? "",
        classification: row.classification ?? "UNCLASSIFIED",
        sentAt: row.sent_at ?? "",
        repliedAt: row.replied_at,
        lastReplyAt: row.last_reply_at,
        replyFromEmail: row.reply_from_email,
        replySnippet: row.reply_snippet,
        isTestSend: Boolean(row.is_test_send),
        renderMode: row.render_mode ?? "unknown",
      };
    }),
    nextCursor,
  };
}

type ParsedReply = {
  messageId: string;
  threadId: string;
  fromEmail: string;
  sentAt: string;
  snippet: string;
};

function getPath(record: Record<string, unknown>, paths: string[]): unknown {
  for (const path of paths) {
    const parts = path.split(".");
    let current: unknown = record;
    for (const part of parts) {
      if (!current || typeof current !== "object") {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (current !== undefined && current !== null) {
      return current;
    }
  }
  return undefined;
}

function parseEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function toIsoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const asNum = Number(value);
    if (Number.isFinite(asNum)) {
      const millis = asNum > 1_000_000_000_000 ? asNum : asNum * 1000;
      return new Date(millis).toISOString();
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function parseReplyMessage(message: unknown): ParsedReply | null {
  if (!message || typeof message !== "object") return null;
  const record = message as Record<string, unknown>;

  const threadIdRaw = getPath(record, ["threadId", "thread_id", "data.threadId", "data.thread_id"]);
  const messageIdRaw = getPath(record, ["id", "messageId", "message_id", "data.id"]);
  const snippetRaw = getPath(record, ["snippet", "body.preview", "body", "text", "data.snippet"]);
  const sentAtRaw = getPath(record, ["internalDate", "timestamp", "date", "data.internalDate", "receivedAt"]);

  const payloadHeaders = getPath(record, ["payload.headers"]) as unknown;
  const headerFrom =
    Array.isArray(payloadHeaders)
      ? payloadHeaders.find((item) => {
          if (!item || typeof item !== "object") return false;
          const name = String((item as Record<string, unknown>).name ?? "").toLowerCase();
          return name === "from";
        })
      : null;
  const fromRaw =
    (headerFrom && typeof headerFrom === "object"
      ? (headerFrom as Record<string, unknown>).value
      : null) ??
    getPath(record, ["from", "sender", "data.from"]);

  const threadId = String(threadIdRaw ?? "").trim();
  const messageId = String(messageIdRaw ?? "").trim();
  const fromEmail = parseEmailAddress(String(fromRaw ?? "").trim());
  const sentAt = toIsoDate(sentAtRaw) ?? new Date().toISOString();
  const snippet = String(snippetRaw ?? "").trim().slice(0, 500);

  if (!threadId || !messageId || !fromEmail) return null;
  return { messageId, threadId, fromEmail, sentAt, snippet };
}

export async function syncInboxReplies(options?: { campaignId?: string; maxAccounts?: number }) {
  const nowIso = new Date().toISOString();
  const maxAccounts = Math.min(Math.max(options?.maxAccounts ?? 10, 1), 50);

  const { data: accountRows, error: accountError } = await supabaseServer
    .from("email_accounts")
    .select("id,gmail_address")
    .eq("is_active", true)
    .eq("connection_status", "connected")
    .limit(maxAccounts);
  if (accountError) throw new Error(accountError.message);

  let allowedCampaignId: string | null = null;
  if (options?.campaignId) {
    allowedCampaignId = options.campaignId;
  }

  const connectedAccounts = (accountRows ?? []) as Array<{ id: string; gmail_address: string | null }>;
  if (!connectedAccounts.length) {
    return {
      ok: true,
      scannedAccounts: 0,
      scannedMessages: 0,
      updatedRows: 0,
      skippedOutbound: 0,
      accountErrors: [] as Array<{ accountId: string; error: string }>,
    };
  }

  const repliesByThread = new Map<string, ParsedReply>();
  let scannedMessages = 0;
  let skippedOutbound = 0;
  const accountErrors: Array<{ accountId: string; error: string }> = [];

  for (const account of connectedAccounts) {
    const selfEmail = (account.gmail_address ?? "").trim().toLowerCase();
    try {
      const messages = await readInboxWithComposio(account.id, "newer_than:30d");
      for (const raw of messages) {
        scannedMessages += 1;
        const parsed = parseReplyMessage(raw);
        if (!parsed) continue;
        if (selfEmail && parsed.fromEmail === selfEmail) {
          skippedOutbound += 1;
          continue;
        }
        const previous = repliesByThread.get(parsed.threadId);
        if (!previous || previous.sentAt < parsed.sentAt) {
          repliesByThread.set(parsed.threadId, parsed);
        }
      }
    } catch (error) {
      accountErrors.push({
        accountId: account.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const threadIds = Array.from(repliesByThread.keys());
  if (!threadIds.length) {
    return {
      ok: true,
      scannedAccounts: connectedAccounts.length,
      scannedMessages,
      updatedRows: 0,
      skippedOutbound,
      accountErrors,
    };
  }

  const { data: sentRows, error: sentError } = await supabaseServer
    .from("emails_sent")
    .select("id,campaign_id,enrollment_id,gmail_thread_id,replied_at,last_reply_at,reply_message_id,sent_at")
    .in("gmail_thread_id", threadIds);
  if (sentError) throw new Error(sentError.message);

  const rowsByThread = new Map<string, Array<Record<string, unknown>>>();
  for (const row of sentRows ?? []) {
    const rowThreadId = String((row as Record<string, unknown>).gmail_thread_id ?? "");
    if (!rowThreadId) continue;
    const group = rowsByThread.get(rowThreadId) ?? [];
    group.push(row as Record<string, unknown>);
    rowsByThread.set(rowThreadId, group);
  }

  let updatedRows = 0;
  const enrollmentIdsToMark = new Set<string>();

  for (const [threadId, reply] of repliesByThread.entries()) {
    const candidates = rowsByThread.get(threadId) ?? [];
    if (!candidates.length) continue;

    const filteredCandidates = allowedCampaignId
      ? candidates.filter((row) => String(row.campaign_id ?? "") === allowedCampaignId)
      : candidates;
    if (!filteredCandidates.length) continue;

    const target = filteredCandidates
      .slice()
      .sort((a, b) => String(b.sent_at ?? "").localeCompare(String(a.sent_at ?? "")))[0];
    const currentReplyAt = String(target.last_reply_at ?? target.replied_at ?? "");
    const currentReplyMessageId = String(target.reply_message_id ?? "");
    if (currentReplyMessageId === reply.messageId) continue;
    if (currentReplyAt && currentReplyAt >= reply.sentAt) continue;

    const { error: updateError } = await supabaseServer
      .from("emails_sent")
      .update({
        replied_at: target.replied_at ?? nowIso,
        last_reply_at: reply.sentAt,
        reply_from_email: reply.fromEmail,
        reply_snippet: reply.snippet,
        reply_message_id: reply.messageId,
      })
      .eq("id", String(target.id));
    if (!updateError) {
      updatedRows += 1;
      const enrollmentId = String(target.enrollment_id ?? "");
      if (enrollmentId) enrollmentIdsToMark.add(enrollmentId);
    }
  }

  if (enrollmentIdsToMark.size) {
    await supabaseServer
      .from("enrollments")
      .update({ status: "replied" })
      .in("id", Array.from(enrollmentIdsToMark));
  }

  return {
    ok: true,
    scannedAccounts: connectedAccounts.length,
    scannedMessages,
    updatedRows,
    skippedOutbound,
    accountErrors,
  };
}
