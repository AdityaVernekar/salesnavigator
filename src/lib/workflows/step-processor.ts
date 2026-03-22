import { supabaseServer } from "@/lib/supabase/server";
import { selectSendingAccount } from "@/lib/email/router";
import { sendEmailWithComposio } from "@/lib/composio/gmail";
import { renderTemplate, renderTemplateBodies } from "@/lib/email/templates";
import { computeNextStepAt, applySchedulingWindow } from "./schedule";
import type { SequenceStep, SendWindowConfig } from "./sequence-schema";

type Enrollment = {
  id: string;
  campaign_id: string;
  contact_id: string;
  account_id: string | null;
  current_step: number;
  status: string;
  gmail_thread_id: string | null;
  company_id: string;
};

type Campaign = {
  id: string;
  sequence_steps: SequenceStep[];
  value_prop: string | null;
  persona_name: string | null;
  persona_title: string | null;
  persona_company: string | null;
  send_window_start: string;
  send_window_end: string;
  send_window_timezone: string;
  send_window_days: number[];
};

type Contact = {
  id: string;
  name: string | null;
  first_name: string | null;
  email: string | null;
  company_name: string | null;
  headline: string | null;
  timezone: string | null;
  industry: string | null;
  website: string | null;
  product: string | null;
  pain_point: string | null;
  company_size: string | null;
  location: string | null;
  role_summary: string | null;
  recent_activity: string | null;
};

export type StepProcessResult = {
  success: boolean;
  enrollmentId: string;
  stepNumber: number;
  error?: string;
};

export async function processEnrollmentStep(
  enrollment: Enrollment,
  campaign: Campaign,
): Promise<StepProcessResult> {
  const steps = campaign.sequence_steps ?? [];
  const currentStep = steps[enrollment.current_step];

  if (!currentStep) {
    await supabaseServer
      .from("enrollments")
      .update({ status: "completed" })
      .eq("id", enrollment.id);
    return {
      success: true,
      enrollmentId: enrollment.id,
      stepNumber: enrollment.current_step,
    };
  }

  // Load contact
  const { data: contact } = await supabaseServer
    .from("contacts")
    .select("id,name,first_name,email,company_name,headline,timezone,industry,website,product,pain_point,company_size,location,role_summary,recent_activity")
    .eq("id", enrollment.contact_id)
    .single();

  if (!contact?.email) {
    return {
      success: false,
      enrollmentId: enrollment.id,
      stepNumber: enrollment.current_step,
      error: "Contact has no email address",
    };
  }

  // Check if contact has replied (skip if so)
  if (currentStep.step_number > 0) {
    const { data: replied } = await supabaseServer
      .from("emails_sent")
      .select("id")
      .eq("enrollment_id", enrollment.id)
      .not("replied_at", "is", null)
      .limit(1);

    if (replied?.length) {
      await supabaseServer
        .from("enrollments")
        .update({ status: "replied" })
        .eq("id", enrollment.id);
      return {
        success: true,
        enrollmentId: enrollment.id,
        stepNumber: enrollment.current_step,
      };
    }
  }

  // Resolve subject and body
  let subject: string;
  let bodyHtml: string;

  if (currentStep.template_id) {
    const { data: version } = await supabaseServer
      .from("email_template_versions")
      .select("subject_template,body_template")
      .eq("template_id", currentStep.template_id)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (!version) {
      return {
        success: false,
        enrollmentId: enrollment.id,
        stepNumber: enrollment.current_step,
        error: `Template ${currentStep.template_id} not found`,
      };
    }

    const variables = buildTemplateVariables(contact, campaign);
    subject = renderTemplate(version.subject_template, variables);
    const rendered = renderTemplateBodies(version.body_template, variables);
    bodyHtml = rendered.bodyHtml;
  } else {
    const variables = buildTemplateVariables(contact, campaign);
    subject = renderTemplate(currentStep.subject_override ?? "", variables);
    bodyHtml = renderTemplate(currentStep.body_override ?? "", variables);
  }

  if (!subject || !bodyHtml) {
    return {
      success: false,
      enrollmentId: enrollment.id,
      stepNumber: enrollment.current_step,
      error: "Empty subject or body after template rendering",
    };
  }

  // Select sending account
  const account = await selectSendingAccount(campaign.id, {
    contactId: contact.id,
    preferredAccountId: enrollment.account_id,
  });

  // Send email
  const sendResult = await sendEmailWithComposio(
    account.id,
    contact.email,
    subject,
    bodyHtml,
    undefined,
    {
      threadId: enrollment.gmail_thread_id ?? undefined,
    },
  );

  // Update sends_today
  await supabaseServer
    .from("email_accounts")
    .update({ sends_today: (account.sends_today ?? 0) + 1 })
    .eq("id", account.id);

  // Record the sent email
  const now = new Date();
  await supabaseServer.from("emails_sent").insert({
    enrollment_id: enrollment.id,
    account_id: account.id,
    step_number: enrollment.current_step,
    to_email: contact.email,
    subject,
    body_html: bodyHtml,
    sent_at: now.toISOString(),
    company_id: enrollment.company_id,
  });

  // Advance enrollment
  const nextStepIndex = enrollment.current_step + 1;
  const nextStep = steps[nextStepIndex];

  if (!nextStep) {
    // This was the last step
    await supabaseServer
      .from("enrollments")
      .update({
        current_step: nextStepIndex,
        status: "completed",
        gmail_thread_id: sendResult.threadId ?? enrollment.gmail_thread_id,
        account_id: account.id,
      })
      .eq("id", enrollment.id);
  } else {
    const sendWindow: SendWindowConfig = {
      send_window_start: campaign.send_window_start,
      send_window_end: campaign.send_window_end,
      send_window_timezone: campaign.send_window_timezone,
      send_window_days: campaign.send_window_days,
    };
    const nextStepAt = computeNextStepAt(now, nextStep);
    const scheduledSendAt = applySchedulingWindow(
      nextStepAt,
      sendWindow,
      contact.timezone,
    );

    await supabaseServer
      .from("enrollments")
      .update({
        current_step: nextStepIndex,
        next_step_at: nextStepAt.toISOString(),
        scheduled_send_at: scheduledSendAt.toISOString(),
        gmail_thread_id: sendResult.threadId ?? enrollment.gmail_thread_id,
        account_id: account.id,
      })
      .eq("id", enrollment.id);
  }

  return {
    success: true,
    enrollmentId: enrollment.id,
    stepNumber: enrollment.current_step,
  };
}

function buildTemplateVariables(
  contact: Contact,
  campaign: Campaign,
): Record<string, string | null | undefined> {
  return {
    first_name: contact.first_name,
    name: contact.name,
    company_name: contact.company_name,
    headline: contact.headline,
    value_prop: campaign.value_prop,
    persona_name: campaign.persona_name,
    persona_title: campaign.persona_title,
    persona_company: campaign.persona_company,
    industry: contact.industry,
    website: contact.website,
    product: contact.product,
    pain_point: contact.pain_point,
    company_size: contact.company_size,
    location: contact.location,
    role_summary: contact.role_summary,
    recent_activity: contact.recent_activity,
  };
}
