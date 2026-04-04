import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function POST(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;

  const { companyId, role: currentRole } = contextResult.context;
  if (currentRole !== "owner" && currentRole !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/auth/set-password`;
  const { data, error } = await getSupabaseAdmin().auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo,
    data: {
      company_id: companyId,
      role: parsed.data.role,
    },
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  if (data.user?.id) {
    await getSupabaseAdmin().from("company_users").upsert(
      {
        company_id: companyId,
        user_id: data.user.id,
        role: parsed.data.role,
      },
      { onConflict: "company_id,user_id" },
    );
  }

  return NextResponse.json({ ok: true, invited: parsed.data.email });
}
