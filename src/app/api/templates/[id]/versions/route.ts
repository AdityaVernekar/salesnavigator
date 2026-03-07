import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { activateTemplateVersion, createTemplateVersion, getEmailTemplateVersions } from "@/lib/email/templates";
import { requireRouteContext } from "@/lib/auth/route-context";

const createVersionSchema = z.object({
  subjectTemplate: z.string().min(1),
  bodyTemplate: z.string().min(1),
  promptContext: z.string().optional(),
  createdBy: z.string().optional(),
  changeNote: z.string().optional(),
  activate: z.boolean().optional(),
});

const activateSchema = z.object({
  action: z.literal("activate"),
  versionId: z.string().uuid(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;
  const { id } = await params;
  try {
    const versions = await getEmailTemplateVersions(companyId, id);
    return NextResponse.json({ ok: true, versions });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list versions" },
      { status: 400 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;
  const { id } = await params;
  const body = await request.json();
  if (body?.action === "activate") {
    const activateParsed = activateSchema.safeParse(body);
    if (!activateParsed.success) {
      return NextResponse.json({ ok: false, error: activateParsed.error.message }, { status: 400 });
    }
    try {
      await activateTemplateVersion(companyId, id, activateParsed.data.versionId);
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Failed to activate version" },
        { status: 400 },
      );
    }
  }

  const parsed = createVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  try {
    const version = await createTemplateVersion({
      companyId,
      templateId: id,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, version });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create version" },
      { status: 400 },
    );
  }
}
