import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

interface WebhookEvent {
  event_type: string;
  data: {
    inbox_id?: string;
    message_id?: string;
    thread_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    text?: string;
    html?: string;
    extracted_text?: string;
    timestamp?: string;
    [key: string]: unknown;
  };
}

async function findAccountByInboxId(inboxId: string) {
  const { data } = await supabaseServer
    .from("email_accounts")
    .select("id,company_id,gmail_address")
    .eq("agentmail_inbox_id", inboxId)
    .eq("provider", "agentmail")
    .single();
  return data;
}

async function handleMessageReceived(event: WebhookEvent) {
  const { inbox_id, thread_id, from, extracted_text, timestamp, message_id } = event.data;
  if (!inbox_id || !thread_id) return;

  const account = await findAccountByInboxId(inbox_id);
  if (!account) return;

  const selfEmail = (account.gmail_address ?? "").trim().toLowerCase();
  const fromEmail = (from ?? "").trim().toLowerCase();
  if (selfEmail && fromEmail === selfEmail) return;

  const { data: sentRows } = await supabaseServer
    .from("emails_sent")
    .select("id,enrollment_id,replied_at,last_reply_at,reply_message_id")
    .eq("company_id", account.company_id)
    .or(`gmail_thread_id.eq.${thread_id},agentmail_message_id.is.not.null`)
    .order("sent_at", { ascending: false })
    .limit(10);

  const matchingRows = (sentRows ?? []).filter(
    (row) => !row.reply_message_id || row.reply_message_id !== message_id,
  );
  if (!matchingRows.length) return;

  const target = matchingRows[0];
  const replyAt = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
  const snippet = (extracted_text ?? "").slice(0, 500);

  await supabaseServer
    .from("emails_sent")
    .update({
      replied_at: target.replied_at ?? replyAt,
      last_reply_at: replyAt,
      reply_from_email: fromEmail,
      reply_snippet: snippet,
      reply_message_id: message_id ?? null,
    })
    .eq("id", target.id);

  if (target.enrollment_id) {
    await supabaseServer
      .from("enrollments")
      .update({ status: "replied" })
      .eq("id", target.enrollment_id);
  }
}

async function handleDeliveryEvent(event: WebhookEvent) {
  const { inbox_id, message_id, thread_id } = event.data;
  if (!inbox_id) return;

  const account = await findAccountByInboxId(inbox_id);
  if (!account) return;

  let emailSentId: string | null = null;
  if (message_id) {
    const { data } = await supabaseServer
      .from("emails_sent")
      .select("id")
      .eq("agentmail_message_id", message_id)
      .single();
    emailSentId = data?.id ?? null;
  }

  await supabaseServer.from("email_delivery_events").insert({
    company_id: account.company_id,
    email_sent_id: emailSentId,
    event_type: event.event_type.replace("message.", ""),
    inbox_id,
    message_id: message_id ?? null,
    thread_id: thread_id ?? null,
    raw_payload: event.data,
  });

  if (event.event_type === "message.bounced" && emailSentId) {
    await supabaseServer
      .from("emails_sent")
      .update({ bounced: true })
      .eq("id", emailSentId);
  }
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = request.headers.get("x-webhook-signature") ?? request.headers.get("x-agentmail-signature");
    if (signature !== webhookSecret) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let event: WebhookEvent;
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.event_type) {
      case "message.received":
        await handleMessageReceived(event);
        break;
      case "message.delivered":
      case "message.bounced":
      case "message.complained":
      case "message.rejected":
        await handleDeliveryEvent(event);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(`[agentmail-webhook] Error handling ${event.event_type}:`, error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
