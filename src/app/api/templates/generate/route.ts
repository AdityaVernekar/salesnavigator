import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildRuntimeAgent } from "@/lib/agents/build-runtime-agent";
import { assertTemplatePlaceholders } from "@/lib/email/templates";
import { requireRouteContext } from "@/lib/auth/route-context";

const requestSchema = z.object({
  prompt: z.string().trim().min(8, "Prompt must be at least 8 characters long."),
});

const generatedTemplateSchema = z.object({
  subject_template: z.string().min(1),
  body_template: z.string().min(1),
  rationale: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  try {
    const runtime = await buildRuntimeAgent("cold_email");
    const generation = await runtime.agent.generate(
      runtime.preparePrompt(
        [
          "Generate a reusable outbound email template from the prompt.",
          "Return placeholders only in `{{placeholder}}` format.",
          "Body must be valid lightweight HTML paragraphs using <p> tags.",
          "Keep wording concise and practical for B2B outreach.",
          `User request: ${parsed.data.prompt}`,
        ].join("\n"),
      ),
      {
        structuredOutput: { schema: generatedTemplateSchema },
      },
    );

    const draft = generation.object;
    const placeholders = assertTemplatePlaceholders(draft.subject_template, draft.body_template);
    return NextResponse.json({
      ok: true,
      draft: {
        subjectTemplate: draft.subject_template.trim(),
        bodyTemplate: draft.body_template.trim(),
        rationale: draft.rationale ?? null,
        placeholders,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to generate template draft" },
      { status: 400 },
    );
  }
}
