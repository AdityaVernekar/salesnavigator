import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatCardsProps {
  leads: number;
  emails: number;
  campaigns: number;
  activeRuns: number;
  enrichedContacts: number;
  activeEnrollments: number;
  availableForOutreach: number;
}

export function StatCards({ leads, emails, campaigns, activeRuns, enrichedContacts, activeEnrollments, availableForOutreach }: StatCardsProps) {
  const items = [
    { label: "Total Leads", value: leads, href: "/leads" },
    { label: "Enriched Contacts", value: enrichedContacts },
    { label: "Emails Sent", value: emails },
    { label: "In Active Campaigns", value: activeEnrollments, href: "/enrollments" },
    { label: "Available for Outreach", value: availableForOutreach },
    { label: "Active Runs", value: activeRuns, href: "/runs" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => {
        const content = (
          <>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{item.value}</div>
            </CardContent>
          </>
        );

        if (!item.href) {
          return <Card key={item.label}>{content}</Card>;
        }

        return (
          <Link key={item.label} href={item.href}>
            <Card className="transition-colors hover:bg-muted/40">{content}</Card>
          </Link>
        );
      })}
    </div>
  );
}
