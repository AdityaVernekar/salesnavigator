import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MailboxSignatureSettings } from "@/components/gmail/mailbox-signature-settings";
import { AgentMailConnectForm } from "@/components/agentmail/agentmail-connect-form";
import { AgentMailDeleteButton } from "@/components/agentmail/agentmail-delete-button";
import { requireCurrentUserCompany } from "@/lib/auth/user-company";
import { ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

function warmupDay(startDate?: string | null) {
  if (!startDate) return 0;
  const diff = Date.now() - new Date(startDate).getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function WarmupBar({ day, total = 30 }: { day: number; total?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((day / total) * 100)));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">
        Day {day}/{total}
      </span>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const gmailConnectStatus =
    typeof query.gmailConnectStatus === "string" ? query.gmailConnectStatus : null;
  const gmailConnectError =
    typeof query.gmailConnectError === "string" ? query.gmailConnectError : null;
  const gmailEmail =
    typeof query.gmailEmail === "string" ? query.gmailEmail : null;
  const { supabase, companyId } = await requireCurrentUserCompany();

  async function toggleMailboxStatus(formData: FormData) {
    "use server";
    const { supabase: actionClient, companyId: actionCompanyId } =
      await requireCurrentUserCompany();
    const accountId = String(formData.get("accountId") ?? "");
    const isActive = String(formData.get("isActive") ?? "") === "true";
    if (!accountId) return;
    await actionClient
      .from("email_accounts")
      .update({ is_active: !isActive })
      .eq("company_id", actionCompanyId)
      .eq("id", accountId);
    revalidatePath("/settings");
  }

  const { data: allAccounts } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const accounts = allAccounts ?? [];
  const totalMailboxes = accounts.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage mailboxes, agent configs, and workspace settings.
          </p>
        </div>
        <Link href="/settings/ops" className="text-sm text-primary underline">
          View Ops Dashboard
        </Link>
      </div>

      <Tabs defaultValue="mailboxes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mailboxes">
            Mailboxes{totalMailboxes > 0 ? ` (${totalMailboxes})` : ""}
          </TabsTrigger>
          <TabsTrigger value="agents">Agent Configs</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
        </TabsList>

        <TabsContent value="mailboxes" className="space-y-4">
          {/* Status banners */}
          {gmailConnectStatus === "success" && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
              Gmail connected successfully{gmailEmail ? ` for ${gmailEmail}` : ""}.
            </div>
          )}
          {gmailConnectStatus === "error" && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              Gmail connect failed{gmailConnectError ? `: ${gmailConnectError}` : "."}
            </div>
          )}

          {/* Connect actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Connect Mailbox</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <form action="/api/gmail/connect" method="GET" className="flex items-center gap-2">
                  <Input
                    name="email"
                    type="email"
                    required
                    placeholder="name@company.com"
                    className="h-8 w-56 text-sm"
                  />
                  <Button type="submit" size="sm" variant="outline">
                    Connect Gmail
                  </Button>
                </form>
              </div>
              <div className="border-t pt-4">
                <AgentMailConnectForm />
              </div>
            </CardContent>
          </Card>

          {/* Unified mailbox table */}
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <p className="text-sm text-muted-foreground">No mailboxes connected yet.</p>
              <p className="text-xs text-muted-foreground">
                Connect a Gmail account or create an AgentMail inbox above.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Email</th>
                    <th className="px-4 py-2.5 text-left font-medium">Type</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">Sends</th>
                    <th className="px-4 py-2.5 text-left font-medium">Connection</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => {
                    const active = account.is_active ?? true;
                    const isAgentMail = account.provider === "agentmail";
                    const day = warmupDay(account.warmup_start_date);

                    return (
                      <tr key={account.id} className="border-b last:border-0">
                        {/* Email */}
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium">{account.gmail_address}</p>
                          {account.display_name && (
                            <p className="text-xs text-muted-foreground">
                              {account.display_name}
                            </p>
                          )}
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3">
                          <Badge
                            variant="secondary"
                            className="text-[11px]"
                          >
                            {isAgentMail ? "AgentMail" : "Gmail"}
                          </Badge>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant={active ? "outline" : "destructive"}
                              className="w-fit text-[11px]"
                            >
                              {active ? "Active" : "Inactive"}
                            </Badge>
                            {!isAgentMail && account.warmup_status && (
                              <Badge variant="outline" className="w-fit text-[11px]">
                                {account.warmup_status}
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Sends */}
                        <td className="px-4 py-3">
                          <p className="text-sm">
                            {account.sends_today ?? 0}
                            <span className="text-muted-foreground">
                              /{account.daily_limit ?? (isAgentMail ? 500 : 50)}
                            </span>
                          </p>
                        </td>

                        {/* Connection */}
                        <td className="px-4 py-3">
                          {isAgentMail ? (
                            <p className="text-xs text-muted-foreground">
                              Created{" "}
                              {account.created_at
                                ? new Date(account.created_at).toLocaleDateString()
                                : "—"}
                            </p>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                {account.connection_status ?? "pending"}
                                {account.last_connected_at
                                  ? ` · ${new Date(account.last_connected_at).toLocaleDateString()}`
                                  : ""}
                              </p>
                              <WarmupBar day={day} />
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <form action={toggleMailboxStatus}>
                              <input type="hidden" name="accountId" value={account.id} />
                              <input
                                type="hidden"
                                name="isActive"
                                value={active ? "true" : "false"}
                              />
                              <Button type="submit" size="sm" variant="ghost" className="h-7 text-xs">
                                {active ? "Deactivate" : "Activate"}
                              </Button>
                            </form>
                            {isAgentMail ? (
                              <AgentMailDeleteButton accountId={account.id} />
                            ) : (
                              <Link
                                href={`/api/gmail/connect?email=${encodeURIComponent(account.gmail_address)}`}
                              >
                                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs">
                                  Reconnect
                                </Button>
                              </Link>
                            )}
                          </div>
                          {!isAgentMail && (
                            <div className="mt-1 flex justify-end">
                              <MailboxSignatureSettings
                                accountId={account.id}
                                initialSignatureHtml={account.signature_html}
                                initialEnabledByDefault={account.signature_enabled_by_default}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="agents">
          <Card>
            <CardHeader>
              <CardTitle>Agent Configs</CardTitle>
              <CardDescription>Configure the AI agents in your pipeline.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { slug: "lead_gen", label: "Lead Gen", desc: "Find companies matching ICP" },
                  { slug: "people_gen", label: "People Gen", desc: "Find decision-makers" },
                  { slug: "enrichment", label: "Enrichment", desc: "Deep company/person profiling" },
                  { slug: "scoring", label: "Scoring", desc: "Evaluate ICP fit" },
                  { slug: "cold_email", label: "Cold Email", desc: "Outreach email generation" },
                  { slug: "followup", label: "Follow-up", desc: "Follow-up email generation" },
                ].map((agent) => (
                  <Link
                    key={agent.slug}
                    href={`/settings/agents/${agent.slug}`}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-accent"
                  >
                    <div>
                      <p className="text-sm font-medium">{agent.label}</p>
                      <p className="text-xs text-muted-foreground">{agent.desc}</p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workspace">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Settings</CardTitle>
              <CardDescription>Templates, suppressions, and operational tools.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { href: "/settings/templates", label: "Templates", desc: "Email template repository" },
                  { href: "/settings/suppressions", label: "Suppressions", desc: "Manage suppression lists" },
                  { href: "/settings/ops", label: "Ops Dashboard", desc: "System health & monitoring" },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-accent"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
