import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!value) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return value;
}

function getSupabaseAnonKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!value) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return value;
}

export async function createSupabaseServerAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items) {
        try {
          for (const item of items) {
            cookieStore.set(item.name, item.value, item.options);
          }
        } catch {
          // Next.js forbids cookie writes in some server-render contexts.
          // Route handlers and server actions can still set cookies normally.
        }
      },
    },
  });
}
