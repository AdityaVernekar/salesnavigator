import { NextResponse } from "next/server";
import { requireRouteContext } from "@/lib/auth/route-context";
import { getAgentMailClient } from "@/lib/agentmail/client";

export async function GET() {
  const auth = await requireRouteContext();
  if (!auth.ok) return auth.response;

  try {
    const client = getAgentMailClient();
    const res = await client.domains.list();
    console.log(res);
    const domains = (res.domains ?? []).map((d) => ({
      id: d.domainId,
      domain: d.domain,
      verified: d.status === "VERIFIED",
    }));
    // Always include default domains
    if (!domains.some((d) => d.domain === "agentmail.to")) {
      domains.unshift({ id: "default", domain: "agentmail.to", verified: true });
    }
    if (!domains.some((d) => d.domain === "getlexsis.com")) {
      domains.push({ id: "default-lexsis", domain: "getlexsis.com", verified: true });
    }
    return NextResponse.json({ ok: true, domains });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list domains" },
      { status: 500 },
    );
  }
}
