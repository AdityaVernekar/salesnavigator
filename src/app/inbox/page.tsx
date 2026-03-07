import { InboxDashboard } from "@/components/inbox/inbox-dashboard";
import { listInboxItems } from "@/lib/inbox/service";
import { requireCurrentUserCompany } from "@/lib/auth/user-company";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view = readParam(params.view, "replies") === "sent" ? "sent" : "replies";
  const campaignId = readParam(params.campaignId, "all");
  const cursor = readParam(params.cursor, "");
  const limitRaw = Number(readParam(params.limit, "50"));
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
  const { supabase, companyId } = await requireCurrentUserCompany();

  const [inboxResult, campaignResult] = await Promise.all([
    listInboxItems({
      companyId,
      view,
      campaignId: campaignId === "all" ? undefined : campaignId,
      limit,
      cursor: cursor || undefined,
    }),
    supabase.from("campaigns").select("id,name").eq("company_id", companyId).order("name", { ascending: true }),
  ]);

  const campaigns = (campaignResult.data ?? []).map((campaign) => ({
    id: String(campaign.id),
    name: String(campaign.name ?? "Untitled campaign"),
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      <p className="text-sm text-muted-foreground">
        Track sent emails and replies with campaign filters and live sync.
      </p>
      <InboxDashboard
        items={inboxResult.items}
        campaigns={campaigns}
        view={view}
        campaignId={campaignId}
        limit={limit}
        cursor={cursor || undefined}
        nextCursor={inboxResult.nextCursor}
      />
    </div>
  );
}
