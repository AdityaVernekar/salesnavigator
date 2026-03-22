import { generateWarmupEmail } from "@/lib/warmup/content";
import { supabaseServer } from "@/lib/supabase/server";
import { sendEmailWithComposio } from "@/lib/composio/gmail";

function getWarmupTarget(daysInWarmup: number): number {
  if (daysInWarmup <= 3) return 5;
  if (daysInWarmup <= 7) return 15;
  if (daysInWarmup <= 14) return 30;
  return 50;
}

function shouldGraduate(daysInWarmup: number): boolean {
  return daysInWarmup >= 21;
}

export async function runWarmupCycle() {
  const { data: accounts } = await supabaseServer
    .from("email_accounts")
    .select("*")
    .eq("is_active", true)
    .in("warmup_status", ["new", "warming"]);

  const list = accounts ?? [];

  for (const account of list) {
    const start = account.warmup_start_date ? new Date(account.warmup_start_date) : new Date();
    const daysInWarmup = Math.max(1, Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const target = getWarmupTarget(daysInWarmup);

    if (shouldGraduate(daysInWarmup)) {
      await supabaseServer
        .from("email_accounts")
        .update({ warmup_status: "graduated", daily_limit: 50 })
        .eq("id", account.id);
      continue;
    }

    const partners = list.filter((other) => other.id !== account.id).slice(0, Math.min(3, target));
    for (const partner of partners) {
      const content = await generateWarmupEmail();
      await sendEmailWithComposio(account.id, partner.gmail_address, content.subject, content.body);
      await supabaseServer.from("warmup_logs").insert({
        from_account_id: account.id,
        to_account_id: partner.id,
        direction: "sent",
      });
    }

    await supabaseServer
      .from("email_accounts")
      .update({
        warmup_status: "warming",
        warmup_start_date: account.warmup_start_date ?? new Date().toISOString().slice(0, 10),
        daily_limit: target,
      })
      .eq("id", account.id);
  }

  return { accountsProcessed: list.length };
}
