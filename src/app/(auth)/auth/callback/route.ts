import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = await createSupabaseServerAuthClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const metadataCompanyId = user.user_metadata?.company_id;
    if (metadataCompanyId && typeof metadataCompanyId === "string") {
      await getSupabaseAdmin().from("company_users").upsert(
        {
          company_id: metadataCompanyId,
          user_id: user.id,
          role: "member",
        },
        { onConflict: "company_id,user_id" },
      );
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
