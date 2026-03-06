import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEmailTemplate, getEmailTemplateVersions, listEmailTemplates } from "@/lib/email/templates";

const createTemplateSchema = z.object({
  name: z.string().min(1),
  subjectTemplate: z.string().min(1),
  bodyTemplate: z.string().min(1),
  promptContext: z.string().optional(),
  createdBy: z.string().optional(),
  changeNote: z.string().optional(),
});

export async function GET() {
  try {
    const templates = await listEmailTemplates();
    const withActiveVersion = await Promise.all(
      templates.map(async (template) => {
        const versions = await getEmailTemplateVersions(template.id);
        return {
          ...template,
          versions,
          activeVersion:
            versions.find((item) => item.id === template.active_version_id) ?? versions[0] ?? null,
        };
      }),
    );
    return NextResponse.json({ ok: true, templates: withActiveVersion });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list templates" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const parsed = createTemplateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  try {
    const created = await createEmailTemplate(parsed.data);
    return NextResponse.json({ ok: true, template: created.template, version: created.version });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create template" },
      { status: 400 },
    );
  }
}
