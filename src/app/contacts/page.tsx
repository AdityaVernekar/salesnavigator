import Link from "next/link";
import { ContactsTableShell } from "@/components/contacts/contacts-table-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireCurrentUserCompany } from "@/lib/auth/user-company";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

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
}

function buildContactsHref(page: number, q: string) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q.trim()) params.set("q", q.trim());
  return `/contacts?${params.toString()}`;
}

async function getContactRows(requestedPage: number, q: string): Promise<ContactsPageData> {
  const { supabase, companyId } = await requireCurrentUserCompany();
  const firstFrom = (requestedPage - 1) * PAGE_SIZE;
  const firstTo = firstFrom + PAGE_SIZE - 1;

  let query = supabase
    .from("contacts")
    .select("id,lead_id,name,email,linkedin_url,company_name,created_at", { count: "exact" })
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .or("email.not.is.null,linkedin_url.not.is.null")
    .range(firstFrom, firstTo);

  if (q) {
    query = query.or(
      `name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%,linkedin_url.ilike.%${q}%`,
    );
  }

  const { data: firstContacts, count } = await query;

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const contacts =
    currentPage === requestedPage
      ? (firstContacts ?? [])
      : ((
          await supabase
            .from("contacts")
            .select("id,lead_id,name,email,linkedin_url,company_name,created_at")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .or("email.not.is.null,linkedin_url.not.is.null")
            .range(
              (currentPage - 1) * PAGE_SIZE,
              (currentPage - 1) * PAGE_SIZE + PAGE_SIZE - 1,
            )
        ).data ?? []);

  const eligibleContacts = contacts.filter((contact) => {
    const hasEmail = Boolean(contact.email?.trim());
    const hasLinkedin = Boolean(contact.linkedin_url?.trim());
    return hasEmail || hasLinkedin;
  });

  if (!eligibleContacts.length) {
    return {
      rows: [],
      totalCount,
      totalPages,
      currentPage,
      from: 0,
      to: 0,
    };
  }

  const leadIds = Array.from(new Set(eligibleContacts.map((contact) => contact.lead_id).filter(Boolean)));
  const { data: leads } = leadIds.length
    ? await supabase
        .from("leads")
        .select("id,status,source,company_name")
        .eq("company_id", companyId)
        .in("id", leadIds)
    : { data: [] };
  const leadById = new Map((leads ?? []).map((lead) => [lead.id, lead]));

  const contactIds = eligibleContacts.map((contact) => contact.id);
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

  return {
    rows,
    totalCount,
    totalPages,
    currentPage,
    from,
    to,
  };
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const pageValue = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const requestedPage = Number.isFinite(pageValue) ? Math.max(1, pageValue) : 1;
  const q = (resolvedSearchParams.q ?? "").trim();

  const { rows, totalCount, totalPages, currentPage, from, to } =
    await getContactRows(requestedPage, q);

  const previousPageHref = buildContactsHref(Math.max(1, currentPage - 1), q);
  const nextPageHref = buildContactsHref(Math.min(totalPages, currentPage + 1), q);
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <p className="text-sm text-muted-foreground">
          Select contacts with email or LinkedIn and run the pipeline on just those records.
        </p>
      </div>

      <form action="/contacts" method="get" className="flex items-end gap-2">
        <div className="flex w-full max-w-md flex-col gap-1">
          <label htmlFor="contacts-q" className="text-sm text-muted-foreground">
            Search
          </label>
          <Input
            id="contacts-q"
            name="q"
            defaultValue={q}
            placeholder="Name, company, email, or LinkedIn"
          />
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
        {q ? (
          <Button asChild variant="ghost">
            <Link href="/contacts">Clear</Link>
          </Button>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed p-6">
          <p className="text-sm font-medium">
            {q ? "No contacts match this search." : "No contacts with email or LinkedIn yet."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Run discovery/enrichment first, then come back here to select contacts for pipeline runs.
          </p>
          <Link href="/leads" className="mt-3 inline-block text-sm text-primary underline">
            Go to leads
          </Link>
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
