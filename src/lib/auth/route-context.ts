import { NextResponse } from "next/server";
import { getMembershipForUser } from "@/lib/auth/membership";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

export interface RouteAuthContext {
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>;
  userId: string;
  companyId: string;
  role: "owner" | "admin" | "member";
}

type RouteContextResult =
  | { ok: true; context: RouteAuthContext }
  | { ok: false; response: NextResponse };

export async function requireRouteContext(): Promise<RouteContextResult> {
  const supabase = await createSupabaseServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const membership = await getMembershipForUser({ userId: user.id, supabase });
  if (!membership?.companyId) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "No company membership found" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    context: {
      supabase,
      userId: user.id,
      companyId: membership.companyId,
      role: membership.role,
    },
  };
}
