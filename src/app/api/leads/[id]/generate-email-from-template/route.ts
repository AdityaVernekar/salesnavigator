import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildRuntimeAgent } from "@/lib/agents/build-runtime-agent";
import { renderTemplate } from "@/lib/email/templates";
import { requireRouteContext } from "@/lib/auth/route-context";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const generateFromTemplateSchema = z.object({
  contactId: z.string().uuid(),
  templateId: z.string().uuid(),
});

const generatedEmailSchema = z.object({
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

  const parsedBody = generateFromTemplateSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: parsedBody.error.message }, { status: 400 });
  }

  const leadId = parsedParams.data.id;
  const payload = parsedBody.data;

  const [{ data: lead }, { data: contact }, { data: template }] = await Promise.all([
    supabase
      .from("leads")
      .select("id,company_name,company_domain")
      .eq("company_id", companyId)
      .eq("id", leadId)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("id,lead_id,name,first_name,email,headline,company_name")
      .eq("company_id", companyId)
      .eq("id", payload.contactId)
      .eq("lead_id", leadId)
      .maybeSingle(),
    supabase
      .from("email_templates")
      .select("id,name,active_version_id")
      .eq("company_id", companyId)
      .eq("id", payload.templateId)
      .maybeSingle(),
  ]);

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
  }
  if (!contact) {
    return NextResponse.json({ ok: false, error: "Contact not found for this lead" }, { status: 404 });
  }
  if (!template) {
    return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
  }

  const versionRequest = template.active_version_id
    ? supabase
        .from("email_template_versions")
        .select("id,subject_template,body_template")
        .eq("company_id", companyId)
        .eq("id", template.active_version_id)
        .maybeSingle()
    : supabase
        .from("email_template_versions")
        .select("id,subject_template,body_template")
        .eq("company_id", companyId)
        .eq("template_id", template.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

  const { data: version } = await versionRequest;
  if (!version) {
    return NextResponse.json(
      { ok: false, error: "Template does not have an active version" },
      { status: 400 },
    );
  }

  const variables: Record<string, string> = {
    first_name: (contact.first_name ?? contact.name ?? contact.email ?? "").trim(),
    name: contact.name ?? "",
    company_name: contact.company_name ?? lead.company_name ?? "",
    headline: contact.headline ?? "",
    email: contact.email ?? "",
    recommended_angle: "",
    value_prop: "",
  };
  const renderedSubject = renderTemplate(version.subject_template, variables).trim();
  const renderedBody = renderTemplate(version.body_template, variables).trim();

  try {
    const runtime = await buildRuntimeAgent("cold_email");
    const prompt = [
      "Personalize this outbound email from a provided template.",
      "Keep the original intent and CTA from the template, but improve relevance for the contact.",
      "Return JSON with fields: subject, body_html, rationale.",
      "Use lightweight HTML paragraphs in body_html.",
      "",
      "Lead context:",
      `lead_company_name: ${lead.company_name ?? ""}`,
      `lead_company_domain: ${lead.company_domain ?? ""}`,
      "",
      "Contact context:",
      `contact_name: ${contact.name ?? ""}`,
      `contact_first_name: ${contact.first_name ?? ""}`,
      `contact_email: ${contact.email ?? ""}`,
      `contact_headline: ${contact.headline ?? ""}`,
      `contact_company_name: ${contact.company_name ?? ""}`,
      "",
      "Rendered template baseline:",
      `subject: ${renderedSubject}`,
      `body_html: ${renderedBody}`,
    ].join("\n");

    const generation = await runtime.agent.generate(runtime.preparePrompt(prompt), {
      structuredOutput: { schema: generatedEmailSchema },
    });
    const generated = generation.object;
    return NextResponse.json({
      ok: true,
      draft: {
        subject: generated.subject.trim(),
        bodyHtml: generated.body_html.trim(),
        rationale: generated.rationale ?? null,
      },
      templateVersionId: version.id,
      generatedWithAgent: true,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      draft: {
        subject: renderedSubject,
        bodyHtml: renderedBody,
        rationale: "Agent generation failed; showing rendered template baseline.",
      },
      templateVersionId: version.id,
      generatedWithAgent: false,
    });
  }
}
