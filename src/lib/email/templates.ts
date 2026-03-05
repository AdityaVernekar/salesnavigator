import { supabaseServer } from "@/lib/supabase/server";

export const DEFAULT_TEMPLATE_PLACEHOLDERS = [
  "first_name",
  "name",
  "company_name",
  "headline",
  "recommended_angle",
  "value_prop",
] as const;

export type EmailTemplateRecord = {
  id: string;
  name: string;
  status: "active" | "archived";
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailTemplateVersionRecord = {
  id: string;
  template_id: string;
  version: number;
  subject_template: string;
  body_template: string;
  prompt_context: string | null;
  placeholders: string[] | null;
  change_note: string | null;
  created_by: string | null;
  created_at: string;
};

export function extractPlaceholders(subjectTemplate: string, bodyTemplate: string): string[] {
  const tokens = new Set<string>();
  const matcher = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  for (const source of [subjectTemplate, bodyTemplate]) {
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(source))) {
      tokens.add(match[1]);
    }
  }
  return Array.from(tokens).sort();
}

export function assertTemplatePlaceholders(subjectTemplate: string, bodyTemplate: string) {
  const placeholders = extractPlaceholders(subjectTemplate, bodyTemplate);
  const invalid = placeholders.filter((item) => !/^[a-zA-Z0-9_]+$/.test(item));
  if (invalid.length) {
    throw new Error(`Invalid placeholders: ${invalid.join(", ")}`);
  }
  return placeholders;
}

export function renderTemplate(source: string, variables: Record<string, string | null | undefined>) {
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => {
    const value = variables[key];
    return typeof value === "string" ? value : "";
  });
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderTemplateBodies(
  bodyTemplate: string,
  variables: Record<string, string | null | undefined>,
) {
  const bodyHtml = renderTemplate(bodyTemplate, variables).trim();
  const bodyText = htmlToPlainText(bodyHtml);
  return { bodyHtml, bodyText };
}

export async function listEmailTemplates() {
  const { data, error } = await supabaseServer
    .from("email_templates")
    .select("id,name,status,active_version_id,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as EmailTemplateRecord[];
}

export async function getEmailTemplateById(templateId: string) {
  const { data, error } = await supabaseServer
    .from("email_templates")
    .select("id,name,status,active_version_id,created_at,updated_at")
    .eq("id", templateId)
    .single();
  if (error || !data) return null;
  return data as EmailTemplateRecord;
}

export async function getEmailTemplateVersions(templateId: string) {
  const { data, error } = await supabaseServer
    .from("email_template_versions")
    .select(
      "id,template_id,version,subject_template,body_template,prompt_context,placeholders,change_note,created_by,created_at",
    )
    .eq("template_id", templateId)
    .order("version", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as EmailTemplateVersionRecord[];
}

export async function createEmailTemplate(input: {
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  promptContext?: string;
  createdBy?: string;
  changeNote?: string;
}) {
  const { data: template, error: templateError } = await supabaseServer
    .from("email_templates")
    .insert({ name: input.name, status: "active" })
    .select("id,name,status,active_version_id,created_at,updated_at")
    .single();
  if (templateError || !template) {
    throw new Error(templateError?.message ?? "Failed to create template");
  }

  const placeholders = assertTemplatePlaceholders(input.subjectTemplate, input.bodyTemplate);
  const { data: version, error: versionError } = await supabaseServer
    .from("email_template_versions")
    .insert({
      template_id: template.id,
      version: 1,
      subject_template: input.subjectTemplate,
      body_template: input.bodyTemplate,
      prompt_context: input.promptContext ?? null,
      placeholders,
      created_by: input.createdBy ?? null,
      change_note: input.changeNote ?? "Initial version",
    })
    .select(
      "id,template_id,version,subject_template,body_template,prompt_context,placeholders,change_note,created_by,created_at",
    )
    .single();

  if (versionError || !version) {
    throw new Error(versionError?.message ?? "Failed to create template version");
  }

  const { error: activateError } = await supabaseServer
    .from("email_templates")
    .update({ active_version_id: version.id, updated_at: new Date().toISOString() })
    .eq("id", template.id);
  if (activateError) {
    throw new Error(activateError.message);
  }

  return { template: template as EmailTemplateRecord, version: version as EmailTemplateVersionRecord };
}

export async function createTemplateVersion(input: {
  templateId: string;
  subjectTemplate: string;
  bodyTemplate: string;
  promptContext?: string;
  createdBy?: string;
  changeNote?: string;
  activate?: boolean;
}) {
  const versions = await getEmailTemplateVersions(input.templateId);
  const nextVersion = (versions[0]?.version ?? 0) + 1;
  const placeholders = assertTemplatePlaceholders(input.subjectTemplate, input.bodyTemplate);
  const { data: version, error: versionError } = await supabaseServer
    .from("email_template_versions")
    .insert({
      template_id: input.templateId,
      version: nextVersion,
      subject_template: input.subjectTemplate,
      body_template: input.bodyTemplate,
      prompt_context: input.promptContext ?? null,
      placeholders,
      created_by: input.createdBy ?? null,
      change_note: input.changeNote ?? null,
    })
    .select(
      "id,template_id,version,subject_template,body_template,prompt_context,placeholders,change_note,created_by,created_at",
    )
    .single();
  if (versionError || !version) {
    throw new Error(versionError?.message ?? "Failed to create template version");
  }

  if (input.activate ?? true) {
    await activateTemplateVersion(input.templateId, version.id);
  }
  return version as EmailTemplateVersionRecord;
}

export async function activateTemplateVersion(templateId: string, versionId: string) {
  const { error } = await supabaseServer
    .from("email_templates")
    .update({ active_version_id: versionId, updated_at: new Date().toISOString() })
    .eq("id", templateId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function createTemplateSession(input: {
  templateId?: string;
  createdBy?: string;
  status?: "active" | "completed" | "failed";
}) {
  const { data, error } = await supabaseServer
    .from("template_generation_sessions")
    .insert({
      template_id: input.templateId ?? null,
      created_by: input.createdBy ?? null,
      status: input.status ?? "active",
    })
    .select("id,template_id,status,created_by,created_at")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create session");
  }
  return data;
}

export async function appendTemplateMessage(input: {
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabaseServer
    .from("template_generation_messages")
    .insert({
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
    })
    .select("id,session_id,role,content,metadata,created_at")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to append template message");
  }
  return data;
}

export async function getSessionMessages(sessionId: string) {
  const { data, error } = await supabaseServer
    .from("template_generation_messages")
    .select("id,session_id,role,content,metadata,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}
