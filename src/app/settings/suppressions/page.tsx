import { supabaseServer } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function addSuppression(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!email) return;
  await supabaseServer.from("suppressions").insert({ email, reason });
}

export default async function SuppressionsPage() {
  const { data } = await supabaseServer
    .from("suppressions")
    .select("*")
    .order("added_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Suppression List</h1>
      <form action={addSuppression} className="flex flex-wrap gap-2">
        <Input name="email" type="email" placeholder="email@company.com" className="max-w-xs" />
        <Input name="reason" placeholder="Reason" className="max-w-xs" />
        <Button type="submit">Add</Button>
      </form>
      <div className="space-y-2 text-sm">
        {(data ?? []).map((item) => (
          <div key={item.id} className="rounded border p-2">
            {item.email} {item.reason ? `• ${item.reason}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
