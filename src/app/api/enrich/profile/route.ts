import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { requireRouteContext } from "@/lib/auth/route-context";
import { buildRuntimeAgent } from "@/lib/agents/build-runtime-agent";

const summarySchema = z.object({
  summary: z.string().min(1),
});

const requestSchema = z.object({
  linkedinUrl: z.string().url(),
});

export async function POST(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "A valid LinkedIn URL is required" },
      { status: 400 },
    );
  }

  try {
    const url = new URL("https://search.clado.ai/api/enrich/linkedin");
    url.searchParams.set("linkedin_url", parsed.data.linkedinUrl);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.CLADO_API_KEY}` },
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail =
        typeof data === "object" && data !== null && "detail" in data
          ? String((data as { detail?: unknown }).detail ?? "")
          : "Clado API request failed";
      return NextResponse.json(
        { ok: false, error: detail.slice(0, 500) },
        { status: 502 },
      );
    }

    // Generate an AI summary of the profile
    let summary = "";
    try {
      const runtime = await buildRuntimeAgent("enrichment");
      const prompt = [
        "Write a concise professional summary (3-5 sentences) of this person based on their LinkedIn profile data.",
        "Focus on: who they are, their current role, key expertise, and what makes them notable.",
        "Return JSON with a single field: summary.",
        "",
        `Profile data: ${JSON.stringify(data).slice(0, 3000)}`,
      ].join("\n");
      const generation = await runtime.agent.generate(
        runtime.preparePrompt(prompt),
        { structuredOutput: { schema: summarySchema } },
      );
      summary = generation.object.summary;
    } catch {
      // Summary generation is best-effort; continue without it
    }

    return NextResponse.json({ ok: true, profile: data, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to enrich profile",
      },
      { status: 500 },
    );
  }
}
