import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRouteContext } from "@/lib/auth/route-context";

const updateSignatureSchema = z.object({
  accountId: z.string().uuid(),
  signatureHtml: z.string().max(20000),
  signatureEnabledByDefault: z.boolean(),
});

export async function GET() {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const { data, error } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, accounts: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const contextResult = await requireRouteContext();
  if (!contextResult.ok) return contextResult.response;
  const { supabase, companyId } = contextResult.context;

  const parsed = updateSignatureSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  const payload = parsed.data;
  const { data, error } = await supabase
    .from("email_accounts")
    .update({
      signature_html: payload.signatureHtml,
      signature_enabled_by_default: payload.signatureEnabledByDefault,
    })
    .eq("company_id", companyId)
    .eq("id", payload.accountId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Mailbox not found" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
