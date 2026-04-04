import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    {
      global: {
        fetch: (url, init) =>
          fetch(url, { ...init, cache: "no-store" }),
      },
    },
  );
  return _client;
}

// Lazy proxy so the client is only created at runtime, not at import/build time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabaseServer: SupabaseClient = new Proxy({} as any, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
