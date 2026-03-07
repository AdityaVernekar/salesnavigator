import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";
import { getMembershipForUser } from "@/lib/auth/membership";
import { supabaseAdmin } from "@/lib/supabase/admin";

const createCompanySchema = z.object({
  action: z.literal("create_company"),
  companyName: z.string().trim().min(2).max(80),
});

const joinCompanySchema = z.object({
  action: z.literal("join_company"),
  companyId: z.string().uuid(),
});

const onboardingSchema = z.discriminatedUnion("action", [createCompanySchema, joinCompanySchema]);

function slugifyCompanyName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function withSuffix(base: string, attempt: number) {
  if (attempt === 0) return base || "company";
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base || "company"}-${suffix}`;
}

async function requireAuthedUser() {
  const supabase = await createSupabaseServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return user;
}

export async function POST(request: NextRequest) {
  const user = await requireAuthedUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const existingMembership = await getMembershipForUser({ userId: user.id });
  if (existingMembership?.companyId) {
    return NextResponse.json({ ok: true, companyId: existingMembership.companyId, alreadyMember: true });
  }

  const body = await request.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.action === "join_company") {
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("id", parsed.data.companyId)
      .maybeSingle();
    if (companyError || !company?.id) {
      return NextResponse.json({ ok: false, error: "Company not found for provided company ID" }, { status: 404 });
    }

    const { error: joinError } = await supabaseAdmin.from("company_users").upsert(
      {
        company_id: company.id,
        user_id: user.id,
        role: "member",
      },
      { onConflict: "company_id,user_id" },
    );

    if (joinError) {
      return NextResponse.json({ ok: false, error: joinError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, companyId: company.id, action: "join_company" });
  }

  const baseSlug = slugifyCompanyName(parsed.data.companyName);
  let companyId: string | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = withSuffix(baseSlug, attempt);
    const { data: company, error: createError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: parsed.data.companyName,
        slug,
      })
      .select("id")
      .maybeSingle();

    if (company?.id) {
      companyId = company.id;
      break;
    }
    lastError = createError?.message ?? "Failed to create company";
  }

  if (!companyId) {
    return NextResponse.json({ ok: false, error: lastError ?? "Failed to create company" }, { status: 400 });
  }

  const { error: membershipError } = await supabaseAdmin.from("company_users").insert({
    company_id: companyId,
    user_id: user.id,
    role: "owner",
  });

  if (membershipError) {
    return NextResponse.json({ ok: false, error: membershipError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, companyId, action: "create_company" });
}
