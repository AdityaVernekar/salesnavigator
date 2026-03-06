import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GmailAccountCard } from "@/components/gmail/gmail-account-card";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function warmupDay(startDate?: string | null) {
  if (!startDate) return 0;
  const diff = Date.now() - new Date(startDate).getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const gmailConnectStatus =
    typeof query.gmailConnectStatus === "string"
      ? query.gmailConnectStatus
      : null;
  const gmailConnectError =
    typeof query.gmailConnectError === "string"
      ? query.gmailConnectError
      : null;
  const gmailEmail =
    typeof query.gmailEmail === "string" ? query.gmailEmail : null;

  async function toggleMailboxStatus(formData: FormData) {
    "use server";
    const accountId = String(formData.get("accountId") ?? "");
    const isActive = String(formData.get("isActive") ?? "") === "true";
    if (!accountId) return;
    await supabaseServer
      .from("email_accounts")
      .update({ is_active: !isActive })
      .eq("id", accountId);
    revalidatePath("/settings");
  }

  const { data: accounts } = await supabaseServer
    .from("email_accounts")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage Gmail accounts and agent configs.</p>
        </div>
        <Link href="/settings/ops" className="text-sm text-primary underline">
          View Ops Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connect Gmail Mailbox</CardTitle>
        </CardHeader>
        <CardContent>
          <form action="/api/gmail/connect" method="GET" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the Gmail address you want to connect. We will create/use its Composio user mapping automatically.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                name="email"
                type="email"
                required
                placeholder="name@company.com"
                className="w-[260px]"
              />
              <Button type="submit">Connect Gmail</Button>
            </div>
            {gmailConnectStatus === "success" ? (
              <p className="text-sm text-emerald-600">
                Gmail connected successfully{gmailEmail ? ` for ${gmailEmail}` : ""}.
              </p>
            ) : null}
            {gmailConnectStatus === "error" ? (
              <p className="text-sm text-destructive">
                Gmail connect failed{gmailConnectError ? `: ${gmailConnectError}` : "."}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {(accounts ?? []).map((account) => (
          <GmailAccountCard
            key={account.id}
            gmail={account.gmail_address}
            status={account.warmup_status}
            connectionStatus={account.connection_status}
            connectedAccountId={account.composio_connected_account_id}
            lastConnectedAt={account.last_connected_at}
            sendsToday={account.sends_today ?? 0}
            dailyLimit={account.daily_limit ?? 50}
            warmupDay={warmupDay(account.warmup_start_date)}
            isActive={account.is_active ?? true}
          >
            <p className="text-xs text-muted-foreground">Composio user: {account.composio_user_id}</p>
            <Link
              className="inline-flex text-xs text-primary underline"
              href={`/api/gmail/connect?email=${encodeURIComponent(account.gmail_address)}`}
            >
              Reconnect mailbox
            </Link>
            <form action={toggleMailboxStatus}>
              <input type="hidden" name="accountId" value={account.id} />
              <input type="hidden" name="isActive" value={(account.is_active ?? true) ? "true" : "false"} />
              <Button type="submit" size="sm" variant="outline">
                {(account.is_active ?? true) ? "Deactivate" : "Activate"}
              </Button>
            </form>
          </GmailAccountCard>
        ))}
        {(accounts ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No connected mailboxes yet.</p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent Configs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="link" className="h-auto p-0">
              <Link href="/settings/agents/lead_gen">Lead Gen</Link>
            </Button>
            <Button asChild variant="link" className="h-auto p-0">
              <Link href="/settings/agents/people_gen">People Gen</Link>
            </Button>
            <Button asChild variant="link" className="h-auto p-0">
              <Link href="/settings/agents/enrichment">Enrichment</Link>
            </Button>
            <Button asChild variant="link" className="h-auto p-0">
              <Link href="/settings/agents/scoring">Scoring</Link>
            </Button>
            <Button asChild variant="link" className="h-auto p-0">
              <Link href="/settings/agents/cold_email">Cold Email</Link>
            </Button>
            <Button asChild variant="link" className="h-auto p-0">
              <Link href="/settings/agents/followup">Follow-up</Link>
            </Button>
            <Button asChild variant="link" className="h-auto p-0">
              <Link href="/settings/suppressions">Suppressions</Link>
            </Button>
            <Button asChild variant="link" className="h-auto p-0">
              <Link href="/settings/templates">Templates</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
