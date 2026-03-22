import { EnrichProfileForm } from "@/components/enrich/enrich-profile-form";

export const dynamic = "force-dynamic";

export default function EnrichProfilePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Enrich Profile</h1>
      <p className="text-sm text-muted-foreground">
        Paste a LinkedIn profile URL to fetch enrichment data and optionally
        save the person as a lead.
      </p>
      <EnrichProfileForm />
    </div>
  );
}
