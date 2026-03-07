import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

function normalizeSignupError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("already registered") || lower.includes("already exists")) {
    return { status: 409, error: "User already exists. Please sign in instead." };
  }
  if (lower.includes("rate limit")) {
    return {
      status: 429,
      error: "Signup rate limit reached. Please wait and try again.",
    };
  }
  if (lower.includes("password")) {
    return { status: 400, error: "Password does not meet minimum requirements." };
  }
  return { status: 400, error: message };
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();

  const { data: waitlistEntry, error: waitlistError } = await supabaseAdmin
    .from("waitlist")
    .select("is_allowed")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (waitlistError) {
    return NextResponse.json({ ok: false, error: "Could not verify waitlist access." }, { status: 500 });
  }

  if (!waitlistEntry?.is_allowed) {
    return NextResponse.json(
      { ok: false, error: "Your email is not approved yet. Please contact support/admin." },
      { status: 403 },
    );
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (error) {
    const normalized = normalizeSignupError(error.message);
    return NextResponse.json({ ok: false, error: normalized.error }, { status: normalized.status });
  }

  return NextResponse.json({
    ok: true,
    userId: data.user?.id ?? null,
  });
}
