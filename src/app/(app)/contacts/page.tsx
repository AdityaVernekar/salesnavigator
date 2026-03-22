import Link from "next/link";
import { ContactsFilterForm } from "@/components/contacts/contacts-filter-form";
import { ContactsTableShell } from "@/components/contacts/contacts-table-shell";
import { requireCurrentUserCompany } from "@/lib/auth/user-company";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface ContactsFilters {
  q: string;
  status: string;
  tier: string;
  source: string;
  campaignId: string;
}

interface ContactsPageData {
  rows: Array<{
    id: string;
    detailId: string;
    name: string | null;
    company: string | null;
    email: string | null;
    linkedinUrl: string | null;
    source: string | null;
    status: string | null;
    score: number | null;
    tier: string | null;
  }>;
  totalCount: number;
  totalPages: number;
  currentPage: number;
  from: number;
  to: number;
  campaignOptions: Array<{ id: string; name: string }>;
}

function buildContactsHref(page: number, filters: ContactsFilters) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.tier !== "all") params.set("tier", filters.tier);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.campaignId !== "all") params.set("campaignId", filters.campaignId);
  return `/contacts?${params.toString()}`;
}

async function getContactRows(
  requestedPage: number,
  filters: ContactsFilters,
): Promise<ContactsPageData> {
  const { supabase, companyId } = await requireCurrentUserCompany();

  // Fetch campaigns for filter dropdown
  const { data: campaignRows } = await supabase
    .from("campaigns")
    .select("id,name")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  const campaignOptions = (campaignRows ?? []).map((c) => ({ id: c.id, name: c.name }));

  // Build contacts query
  let query = supabase
    .from("contacts")
    .select("id,lead_id,campaign_id,name,email,linkedin_url,company_name,created_at", { count: "exact" })
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .or("email.not.is.null,linkedin_url.not.is.null");

  if (filters.q) {
    query = query.or(
      `name.ilike.%${filters.q}%,company_name.ilike.%${filters.q}%,email.ilike.%${filters.q}%,linkedin_url.ilike.%${filters.q}%`,
    );
  }

  if (filters.campaignId !== "all") {
    query = query.eq("campaign_id", filters.campaignId);
  }

  // For status/tier/source filters, we need to filter via joined tables.
  // Pre-fetch the IDs to filter by if these filters are active.
  let allowedLeadIds: Set<string> | null = null;
  let allowedContactIdsByTier: Set<string> | null = null;

  if (filters.status !== "all" || filters.source !== "all") {
    let leadQuery = supabase
      .from("leads")
      .select("id")
      .eq("company_id", companyId);
    if (filters.status !== "all") leadQuery = leadQuery.eq("status", filters.status);
    if (filters.source !== "all") leadQuery = leadQuery.eq("source", filters.source);
    const { data: filteredLeads } = await leadQuery;
    allowedLeadIds = new Set((filteredLeads ?? []).map((l) => l.id));
  }

  if (filters.tier !== "all") {
    const { data: filteredScores } = await supabase
      .from("icp_scores")
      .select("contact_id")
      .eq("company_id", companyId)
      .eq("tier", filters.tier);
    allowedContactIdsByTier = new Set((filteredScores ?? []).map((s) => s.contact_id));
  }

  // If status/source filter returned zero leads, short-circuit
  if (allowedLeadIds !== null && allowedLeadIds.size === 0) {
    return { rows: [], totalCount: 0, totalPages: 1, currentPage: 1, from: 0, to: 0, campaignOptions };
  }
  if (allowedContactIdsByTier !== null && allowedContactIdsByTier.size === 0) {
    return { rows: [], totalCount: 0, totalPages: 1, currentPage: 1, from: 0, to: 0, campaignOptions };
  }

  // Apply lead_id filter if status/source active
  if (allowedLeadIds !== null) {
    query = query.in("lead_id", Array.from(allowedLeadIds));
  }

  // Apply contact_id filter if tier active
  if (allowedContactIdsByTier !== null) {
    query = query.in("id", Array.from(allowedContactIdsByTier));
  }

  const firstFrom = (requestedPage - 1) * PAGE_SIZE;
  const firstTo = firstFrom + PAGE_SIZE - 1;
  query = query.range(firstFrom, firstTo);

  const { data: firstContacts, count } = await query;

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  let contacts = firstContacts ?? [];

  // If page was clamped, re-fetch the correct page
  if (currentPage !== requestedPage && totalCount > 0) {
    let refetchQuery = supabase
      .from("contacts")
      .select("id,lead_id,campaign_id,name,email,linkedin_url,company_name,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .or("email.not.is.null,linkedin_url.not.is.null")
      .range(
        (currentPage - 1) * PAGE_SIZE,
        (currentPage - 1) * PAGE_SIZE + PAGE_SIZE - 1,
      );
    if (filters.q) {
      refetchQuery = refetchQuery.or(
        `name.ilike.%${filters.q}%,company_name.ilike.%${filters.q}%,email.ilike.%${filters.q}%,linkedin_url.ilike.%${filters.q}%`,
      );
    }
    if (filters.campaignId !== "all") {
      refetchQuery = refetchQuery.eq("campaign_id", filters.campaignId);
    }
    if (allowedLeadIds !== null) {
      refetchQuery = refetchQuery.in("lead_id", Array.from(allowedLeadIds));
    }
    if (allowedContactIdsByTier !== null) {
      refetchQuery = refetchQuery.in("id", Array.from(allowedContactIdsByTier));
    }
    contacts = (await refetchQuery).data ?? [];
  }

  const eligibleContacts = contacts.filter((contact) => {
    const hasEmail = Boolean(contact.email?.trim());
    const hasLinkedin = Boolean(contact.linkedin_url?.trim());
    return hasEmail || hasLinkedin;
  });

  if (!eligibleContacts.length) {
    return { rows: [], totalCount, totalPages, currentPage, from: 0, to: 0, campaignOptions };
  }

  // Fetch related leads and scores
  const leadIds = Array.from(new Set(eligibleContacts.map((c) => c.lead_id).filter(Boolean)));
  const { data: leads } = leadIds.length
    ? await supabase
        .from("leads")
        .select("id,status,source,company_name")
        .eq("company_id", companyId)
        .in("id", leadIds)
    : { data: [] };
  const leadById = new Map((leads ?? []).map((lead) => [lead.id, lead]));

  const contactIds = eligibleContacts.map((c) => c.id);
  const { data: scores } = contactIds.length
    ? await supabase
        .from("icp_scores")
        .select("contact_id,score,tier,scored_at")
        .eq("company_id", companyId)
        .in("contact_id", contactIds)
        .order("scored_at", { ascending: false })
    : { data: [] };
  const scoreByContact = new Map<string, { score: number | null; tier: string | null }>();
  for (const score of scores ?? []) {
    if (!scoreByContact.has(score.contact_id)) {
      scoreByContact.set(score.contact_id, {
        score: typeof score.score === "number" ? score.score : null,
        tier: score.tier ?? null,
      });
    }
  }

  const rows = eligibleContacts.map((contact) => {
    const lead = leadById.get(contact.lead_id);
    const score = scoreByContact.get(contact.id);
    return {
      id: contact.id,
      detailId: contact.id,
      name: contact.name ?? null,
      company: contact.company_name ?? lead?.company_name ?? null,
      email: contact.email ?? null,
      linkedinUrl: contact.linkedin_url ?? null,
      source: lead?.source ?? null,
      status: lead?.status ?? null,
      score: score?.score ?? null,
      tier: score?.tier ?? null,
    };
  });

  const from = (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, totalCount);

  return { rows, totalCount, totalPages, currentPage, from, to, campaignOptions };
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; tier?: string; source?: string; campaignId?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const pageValue = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const requestedPage = Number.isFinite(pageValue) ? Math.max(1, pageValue) : 1;

  const filters: ContactsFilters = {
    q: (resolvedSearchParams.q ?? "").trim(),
    status: resolvedSearchParams.status ?? "all",
    tier: resolvedSearchParams.tier ?? "all",
    source: resolvedSearchParams.source ?? "all",
    campaignId: resolvedSearchParams.campaignId ?? "all",
  };

  const { rows, totalCount, totalPages, currentPage, from, to, campaignOptions } =
    await getContactRows(requestedPage, filters);

  const hasActiveFilters =
    filters.q !== "" || filters.status !== "all" || filters.tier !== "all" || filters.source !== "all" || filters.campaignId !== "all";

  const previousPageHref = buildContactsHref(Math.max(1, currentPage - 1), filters);
  const nextPageHref = buildContactsHref(Math.min(totalPages, currentPage + 1), filters);
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Contacts</h1>
        <p className="text-sm text-muted-foreground">
          Select contacts with email or LinkedIn and run the pipeline on just those records.
        </p>
      </div>

      <ContactsFilterForm
        q={filters.q}
        status={filters.status}
        tier={filters.tier}
        source={filters.source}
        campaignId={filters.campaignId}
        campaignOptions={campaignOptions}
      />

      {rows.length === 0 ? (
        <div className="rounded border border-dashed p-6">
          <p className="text-sm font-medium">
            {hasActiveFilters ? "No contacts match the current filters." : "No contacts with email or LinkedIn yet."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Try adjusting or clearing your filters."
              : "Run discovery/enrichment first, then come back here to select contacts for pipeline runs."}
          </p>
          {!hasActiveFilters && (
            <Link href="/leads" className="mt-3 inline-block text-sm text-primary underline">
              Go to leads
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <ContactsTableShell rows={rows} />
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
