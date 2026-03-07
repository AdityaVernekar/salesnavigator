import { createClient } from "@supabase/supabase-js";

type Role = "owner" | "admin" | "member";

export interface CompanyMembership {
  companyId: string;
  role: Role;
}

let cachedAdminClient: ReturnType<typeof createClient> | null | undefined;

function getAdminClient() {
  if (cachedAdminClient !== undefined) return cachedAdminClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    cachedAdminClient = null;
    return cachedAdminClient;
  }

  cachedAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cachedAdminClient;
}

function normalizeRole(input: string | null | undefined): Role {
  if (input === "owner" || input === "admin" || input === "member") return input;
  return "member";
}

export async function getMembershipForUser(params: {
  userId: string;
  supabase?: any;
}): Promise<CompanyMembership | null> {
  const client = getAdminClient() ?? params.supabase;
  if (!client) return null;

  const { data, error } = await client
    .from("company_users")
    .select("company_id,role")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve company membership", { userId: params.userId, error: error.message });
    return null;
  }

  if (!data?.company_id) return null;

  return {
    companyId: data.company_id,
    role: normalizeRole(data.role),
  };
}
