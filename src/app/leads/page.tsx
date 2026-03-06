import Link from "next/link";
import { LeadsFilterForm } from "@/components/leads/leads-filter-form";
import { type LeadRow } from "@/components/leads/leads-table";
import { LeadsTableShell } from "@/components/leads/leads-table-shell";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface ContactForLead {
  id: string;
  lead_id: string;
  name: string | null;
  company_name: string | null;
}

const PAGE_SIZE = 25;
const STATUS_OPTIONS = [
  "new",
  "enriching",
  "enriched",
  "scored",
  "emailed",
  "disqualified",
  "error",
] as const;
const SOURCE_OPTIONS = ["exa", "clado", "manual"] as const;

interface LeadsFilters {
  status: string;
  source: string;
  q: string;
  campaignId: string;
}

interface LeadsPageData {
  rows: LeadRow[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  from: number;
  to: number;
}

function buildLeadsHref(page: number, filters: LeadsFilters) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.q) params.set("q", filters.q);
  if (filters.campaignId !== "all") params.set("campaignId", filters.campaignId);
  return `/leads?${params.toString()}`;
}

async function getLeadRows(
  requestedPage: number,
  filters: LeadsFilters,
): Promise<LeadsPageData> {
  const firstFrom = (requestedPage - 1) * PAGE_SIZE;
  const firstTo = firstFrom + PAGE_SIZE - 1;
  let firstQuery = supabaseServer
    .from("leads")
    .select("id,company_name,source,status,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(firstFrom, firstTo);

  if (filters.status !== "all") {
    firstQuery = firstQuery.eq("status", filters.status);
  }
  if (filters.source !== "all") {
    firstQuery = firstQuery.eq("source", filters.source);
  }
  if (filters.campaignId !== "all") {
    firstQuery = firstQuery.eq("campaign_id", filters.campaignId);
  }
  if (filters.q) {
    firstQuery = firstQuery.ilike("company_name", `%${filters.q}%`);
  }

  const { data: firstLeads, count } = await firstQuery;

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const leads =
    currentPage === requestedPage
      ? (firstLeads ?? [])
      : ((
          await (() => {
            let fallbackQuery = supabaseServer
              .from("leads")
              .select("id,company_name,source,status,created_at")
              .order("created_at", { ascending: false })
              .range(
                (currentPage - 1) * PAGE_SIZE,
                (currentPage - 1) * PAGE_SIZE + PAGE_SIZE - 1,
              );

            if (filters.status !== "all") {
              fallbackQuery = fallbackQuery.eq("status", filters.status);
            }
            if (filters.source !== "all") {
              fallbackQuery = fallbackQuery.eq("source", filters.source);
            }
            if (filters.campaignId !== "all") {
              fallbackQuery = fallbackQuery.eq("campaign_id", filters.campaignId);
            }
            if (filters.q) {
              fallbackQuery = fallbackQuery.ilike(
                "company_name",
                `%${filters.q}%`,
              );
            }

            return fallbackQuery;
          })()
        ).data ?? []);

  if (!leads.length) {
    return {
      rows: [],
      totalCount,
      totalPages,
      currentPage,
      from: 0,
      to: 0,
    };
  }

  const leadIds = leads.map((lead) => lead.id);
  const { data: contacts } = await supabaseServer
    .from("contacts")
    .select("id,lead_id,name,company_name,created_at")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });

  const contactsByLead = new Map<string, ContactForLead>();
  for (const contact of contacts ?? []) {
    if (!contactsByLead.has(contact.lead_id)) {
      contactsByLead.set(contact.lead_id, contact as ContactForLead);
    }
  }

  const contactIds = (contacts ?? []).map((contact) => contact.id);
  const { data: scores } = contactIds.length
    ? await supabaseServer
        .from("icp_scores")
        .select("contact_id,score,tier,positive_signals")
        .in("contact_id", contactIds)
    : { data: [] };

  const scoreByContact = new Map(
    (scores ?? []).map((score) => [score.contact_id, score]),
  );

  const rows = leads.map((lead) => {
    const contact = contactsByLead.get(lead.id);
    const score = contact ? scoreByContact.get(contact.id) : undefined;

    return {
      id: lead.id,
      detailId: contact?.id ?? lead.id,
      contactId: contact?.id ?? null,
      company: contact?.company_name ?? lead.company_name ?? "Unknown",
      source: lead.source,
      status: lead.status,
      contactName: contact?.name ?? null,
      score: typeof score?.score === "number" ? score.score : null,
      tier: score?.tier ?? null,
    };
  });

  const from = (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, totalCount);

  return {
    rows,
    totalCount,
    totalPages,
    currentPage,
    from,
    to,
  };
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    status?: string;
    source?: string;
    q?: string;
    campaignId?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const pageValue = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const requestedPage = Number.isFinite(pageValue) ? Math.max(1, pageValue) : 1;
  const filters: LeadsFilters = {
    status: STATUS_OPTIONS.includes(
      (resolvedSearchParams.status ?? "all") as (typeof STATUS_OPTIONS)[number],
    )
      ? (resolvedSearchParams.status as string)
      : "all",
    source: SOURCE_OPTIONS.includes(
      (resolvedSearchParams.source ?? "all") as (typeof SOURCE_OPTIONS)[number],
    )
      ? (resolvedSearchParams.source as string)
      : "all",
    q: (resolvedSearchParams.q ?? "").trim(),
    campaignId: (resolvedSearchParams.campaignId ?? "").trim() || "all",
  };
  const { data: campaigns } = await supabaseServer
    .from("campaigns")
    .select("id,name")
    .order("created_at", { ascending: false });

  const { rows, totalCount, totalPages, currentPage, from, to } =
    await getLeadRows(requestedPage, filters);

  const previousPageHref = buildLeadsHref(
    Math.max(1, currentPage - 1),
    filters,
  );
  const nextPageHref = buildLeadsHref(
    Math.min(totalPages, currentPage + 1),
    filters,
  );
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;
  const hasActiveFilters =
    filters.status !== "all" ||
    filters.source !== "all" ||
    filters.campaignId !== "all" ||
    Boolean(filters.q);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="text-sm text-muted-foreground">
          All discovered leads, including qualification signals when available.
        </p>
      </div>
      <LeadsFilterForm
        q={filters.q}
        status={filters.status}
        source={filters.source}
        campaignId={filters.campaignId}
        campaignOptions={(campaigns ?? []).map((campaign) => ({
          id: campaign.id,
          name: campaign.name ?? "Untitled campaign",
        }))}
        statusOptions={STATUS_OPTIONS}
        sourceOptions={SOURCE_OPTIONS}
      />
      {rows.length === 0 ? (
        <div className="rounded border border-dashed p-6">
          <p className="text-sm font-medium">
            {hasActiveFilters
              ? "No leads match these filters."
              : "No leads yet."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Run a pipeline from a campaign to discover leads. If you just ran
            one, refresh in a few seconds.
          </p>
          <Link
            href="/campaigns"
            className="mt-3 inline-block text-sm text-primary underline"
          >
            Go to campaigns
          </Link>
          {requestedPage > 1 ? (
            <Link
              href="/leads?page=1"
              className="mt-3 ml-4 inline-block text-sm text-primary underline"
            >
              Back to page 1
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <LeadsTableShell rows={rows} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-muted-foreground">
              Showing {from}-{to} of {totalCount}
            </p>
            <div className="flex items-center gap-3">
              <Link
                href={previousPageHref}
                aria-disabled={!hasPreviousPage}
                className={`text-sm ${hasPreviousPage ? "text-primary underline" : "pointer-events-none text-muted-foreground no-underline"}`}
              >
                Previous
              </Link>
              <span className="text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Link
                href={nextPageHref}
                aria-disabled={!hasNextPage}
                className={`text-sm ${hasNextPage ? "text-primary underline" : "pointer-events-none text-muted-foreground no-underline"}`}
              >
                Next
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
