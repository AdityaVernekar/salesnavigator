import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildRuntimeAgent } from "@/lib/agents/build-runtime-agent";
import { requireRouteContext } from "@/lib/auth/route-context";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const followUpDraftRequestSchema = z.object({
  emailId: z.string().uuid(),
});

const followUpDraftSchema = z.object({
  subject: z.string().min(1),
  body_html: z.string().min(1),
  rationale: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ ok: false, error: "Invalid lead id" }, { status: 400 });
  }

  const parsedBody = followUpDraftRequestSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: parsedBody.error.message }, { status: 400 });
  }

  const leadId = parsedParams.data.id;
  const { data: lead } = await supabase
    .from("leads")
    .select("id,company_name")
    .eq("company_id", companyId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
  }

  const { data: sourceEmail } = await supabase
    .from("emails_sent")
    .select(
      "id,contact_id,account_id,gmail_thread_id,subject,body_html,sent_at,to_email,reply_snippet,last_reply_at,contact:contacts(id,lead_id,name,first_name,email,headline,company_name)",
    )
    .eq("company_id", companyId)
    .eq("id", parsedBody.data.emailId)
    .maybeSingle();
  if (!sourceEmail || !sourceEmail.contact_id) {
    return NextResponse.json({ ok: false, error: "Email activity item not found" }, { status: 404 });
  }

  const sourceContact = Array.isArray(sourceEmail.contact) ? sourceEmail.contact[0] : sourceEmail.contact;
  if (!sourceContact || sourceContact.lead_id !== leadId) {
    return NextResponse.json({ ok: false, error: "Email does not belong to this lead" }, { status: 400 });
  }

  const recentRequest = sourceEmail.gmail_thread_id
    ? supabase
        .from("emails_sent")
        .select("subject,body_html,sent_at,to_email,reply_snippet,last_reply_at")
        .eq("company_id", companyId)
        .eq("gmail_thread_id", sourceEmail.gmail_thread_id)
        .order("sent_at", { ascending: false })
        .limit(5)
    : supabase
        .from("emails_sent")
        .select("subject,body_html,sent_at,to_email,reply_snippet,last_reply_at")
        .eq("company_id", companyId)
        .eq("contact_id", sourceEmail.contact_id)
        .order("sent_at", { ascending: false })
        .limit(5);
  const { data: recentMessages, error: recentError } = await recentRequest;
  if (recentError) {
    return NextResponse.json({ ok: false, error: recentError.message }, { status: 500 });
  }

  const history = (recentMessages ?? [])
    .map((item, index) => {
      return [
        `message_${index + 1}_sent_at: ${item.sent_at ?? ""}`,
        `message_${index + 1}_to: ${item.to_email ?? ""}`,
        `message_${index + 1}_subject: ${item.subject ?? ""}`,
        `message_${index + 1}_body: ${String(item.body_html ?? "").slice(0, 1200)}`,
        `message_${index + 1}_latest_reply_at: ${item.last_reply_at ?? ""}`,
        `message_${index + 1}_reply_snippet: ${item.reply_snippet ?? ""}`,
      ].join("\n");
    })
    .join("\n\n");

  const prompt = [
    "Write a concise follow-up email draft for B2B outbound.",
    "The draft must be polite, specific, and easy to edit.",
    "Return JSON with fields: subject, body_html, rationale.",
    "Use lightweight HTML paragraphs in body_html.",
    "",
    "Lead context:",
    `lead_company_name: ${lead.company_name ?? ""}`,
    "",
    "Contact context:",
    `contact_name: ${sourceContact.name ?? ""}`,
    `contact_first_name: ${sourceContact.first_name ?? ""}`,
    `contact_email: ${sourceContact.email ?? ""}`,
    `contact_headline: ${sourceContact.headline ?? ""}`,
    `contact_company_name: ${sourceContact.company_name ?? ""}`,
    "",
    "Latest email context:",
    `source_subject: ${sourceEmail.subject ?? ""}`,
    `source_sent_at: ${sourceEmail.sent_at ?? ""}`,
    `source_reply_snippet: ${sourceEmail.reply_snippet ?? ""}`,
    "",
    "Recent thread/contact history (newest first):",
    history || "none",
  ].join("\n");

  try {
    const runtime = await buildRuntimeAgent("followup");
    const generation = await runtime.agent.generate(runtime.preparePrompt(prompt), {
      structuredOutput: { schema: followUpDraftSchema },
    });
    const draft = generation.object;
    return NextResponse.json({
      ok: true,
      draft: {
        subject: draft.subject.trim(),
        bodyHtml: draft.body_html.trim(),
        rationale: draft.rationale ?? null,
      },
      contactId: sourceEmail.contact_id,
      accountId: sourceEmail.account_id ?? null,
      replyThreadId: sourceEmail.gmail_thread_id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to generate follow-up draft",
      },
      { status: 500 },
    );
  }
}
