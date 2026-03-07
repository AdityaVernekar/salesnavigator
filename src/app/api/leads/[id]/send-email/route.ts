import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendEmailWithComposio } from "@/lib/composio/gmail";
import { htmlToPlainText } from "@/lib/email/templates";
import { requireRouteContext } from "@/lib/auth/route-context";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const sendEmailSchema = z.object({
  contactId: z.string().uuid(),
  accountId: z.string().uuid(),
  subject: z.string().trim().min(1).max(300),
  bodyHtml: z.string().trim().min(1),
  templateVersionId: z.string().uuid().nullable().optional(),
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

  const parsedBody = sendEmailSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: parsedBody.error.message }, { status: 400 });
  }

  const leadId = parsedParams.data.id;
  const payload = parsedBody.data;
  const { data: lead } = await supabase
    .from("leads")
    .select("id,campaign_id")
    .eq("company_id", companyId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("id,lead_id,campaign_id,email")
    .eq("company_id", companyId)
    .eq("id", payload.contactId)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ ok: false, error: "Contact not found for this lead" }, { status: 404 });
  }
  if (!contact.email) {
    return NextResponse.json({ ok: false, error: "Contact does not have an email address" }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("email_accounts")
    .select("id,is_active,connection_status")
    .eq("company_id", companyId)
    .eq("id", payload.accountId)
    .maybeSingle();
  if (!account || !account.is_active || account.connection_status !== "connected") {
    return NextResponse.json({ ok: false, error: "Mailbox is not available for sending" }, { status: 400 });
  }

  try {
    const bodyText = htmlToPlainText(payload.bodyHtml);
    const sendResult = await sendEmailWithComposio(
      account.id,
      contact.email,
      payload.subject,
      payload.bodyHtml,
      bodyText,
    );
    const sentAt = new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from("emails_sent")
      .insert({
        company_id: companyId,
        campaign_id: contact.campaign_id ?? lead.campaign_id ?? null,
        contact_id: contact.id,
        account_id: account.id,
        enrollment_id: null,
        step_number: null,
        to_email: contact.email,
        original_to_email: contact.email,
        effective_to_emails: [contact.email],
        is_test_send: false,
        render_mode: sendResult.mode,
        subject: payload.subject,
        body_html: payload.bodyHtml,
        sent_at: sentAt,
        template_version_id: payload.templateVersionId ?? null,
        gmail_thread_id: sendResult.threadId ?? null,
      })
      .select("id,gmail_thread_id,sent_at")
      .single();
    if (insertError || !inserted) {
      return NextResponse.json(
        { ok: false, error: insertError?.message ?? "Failed to persist sent email" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      email: inserted,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send email" },
      { status: 500 },
    );
  }
}
