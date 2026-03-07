import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEmailTemplate, getEmailTemplateVersions, listEmailTemplates } from "@/lib/email/templates";
import { requireRouteContext } from "@/lib/auth/route-context";

const createTemplateSchema = z.object({
  name: z.string().min(1),
  subjectTemplate: z.string().min(1),
  bodyTemplate: z.string().min(1),
  promptContext: z.string().optional(),
  createdBy: z.string().optional(),
  changeNote: z.string().optional(),
});

export async function GET() {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;
  try {
    const templates = await listEmailTemplates(companyId);
    const withActiveVersion = await Promise.all(
      templates.map(async (template) => {
        const versions = await getEmailTemplateVersions(companyId, template.id);
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
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;
  const parsed = createTemplateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  try {
    const created = await createEmailTemplate({
      ...parsed.data,
      companyId,
    });
    return NextResponse.json({ ok: true, template: created.template, version: created.version });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create template" },
      { status: 400 },
    );
  }
}
