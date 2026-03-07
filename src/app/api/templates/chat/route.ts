import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildRuntimeAgent } from "@/lib/agents/build-runtime-agent";
import { requireRouteContext } from "@/lib/auth/route-context";
import {
  appendTemplateMessage,
  assertTemplatePlaceholders,
  createEmailTemplate,
  createTemplateSession,
  createTemplateVersion,
} from "@/lib/email/templates";

const generatedTemplateSchema = z.object({
  subject_template: z.string().min(1),
  body_template: z.string().min(1),
  rationale: z.string().optional(),
});

const chatSchema = z.object({
  prompt: z.string().min(1),
  sessionId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  templateName: z.string().optional(),
  saveAsVersion: z.boolean().optional().default(false),
  createdBy: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { companyId } = contextResult.context;
  const parsed = chatSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  const data = parsed.data;
  try {
    const session = data.sessionId
      ? { id: data.sessionId }
      : await createTemplateSession({
          companyId,
          templateId: data.templateId,
          createdBy: data.createdBy,
        });

    await appendTemplateMessage({
      companyId,
      sessionId: session.id,
      role: "user",
      content: data.prompt,
    });

    const runtime = await buildRuntimeAgent("cold_email");
    const generation = await runtime.agent.generate(
      runtime.preparePrompt(
        [
          "Generate a reusable outbound email template.",
          "Return concise output with only variable placeholders in `{{placeholder}}` format.",
          "Body must be valid lightweight HTML paragraphs using <p> tags.",
          `User request: ${data.prompt}`,
        ].join("\n"),
      ),
      {
        structuredOutput: { schema: generatedTemplateSchema },
      },
    );

    const draft = generation.object;
    const placeholders = assertTemplatePlaceholders(draft.subject_template, draft.body_template);

    await appendTemplateMessage({
      companyId,
      sessionId: session.id,
      role: "assistant",
      content: JSON.stringify(draft),
      metadata: { placeholders, configVersionId: runtime.config.configVersionId },
    });

    let persisted:
      | { kind: "created"; templateId: string; versionId: string; version: number }
      | { kind: "versioned"; templateId: string; versionId: string; version: number }
      | null = null;

    if (data.saveAsVersion) {
      if (data.templateId) {
        const version = await createTemplateVersion({
          companyId,
          templateId: data.templateId,
          subjectTemplate: draft.subject_template,
          bodyTemplate: draft.body_template,
          promptContext: data.prompt,
          createdBy: data.createdBy,
          changeNote: draft.rationale ?? "Generated from chat prompt",
          activate: true,
        });
        persisted = {
          kind: "versioned",
          templateId: data.templateId,
          versionId: version.id,
          version: version.version,
        };
      } else {
        const name = data.templateName?.trim() || `Template ${new Date().toISOString().slice(0, 19)}`;
        const created = await createEmailTemplate({
          companyId,
          name,
          subjectTemplate: draft.subject_template,
          bodyTemplate: draft.body_template,
          promptContext: data.prompt,
          createdBy: data.createdBy,
          changeNote: draft.rationale ?? "Generated from chat prompt",
        });
        persisted = {
          kind: "created",
          templateId: created.template.id,
          versionId: created.version.id,
          version: created.version.version,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      draft: {
        subjectTemplate: draft.subject_template,
        bodyTemplate: draft.body_template,
        rationale: draft.rationale ?? null,
        placeholders,
      },
      persisted,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to generate template draft" },
      { status: 400 },
    );
  }
}
