import { redirect } from "next/navigation";
import { getMembershipForUser } from "@/lib/auth/membership";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

export interface UserCompanyContext {
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>;
  userId: string;
  companyId: string;
  role: "owner" | "admin" | "member";
}

export async function getCurrentUserCompany(): Promise<UserCompanyContext | null> {
  const supabase = await createSupabaseServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const membership = await getMembershipForUser({ userId: user.id, supabase });
  if (!membership?.companyId) return null;

  return {
    supabase,
    userId: user.id,
    companyId: membership.companyId,
    role: membership.role,
  };
}

export async function requireCurrentUserCompany() {
  const context = await getCurrentUserCompany();
  if (!context) redirect("/login");
  return context;
}
