import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CampaignCard } from "@/components/campaigns/campaign-card";
import { CampaignAiQuickGenerate } from "@/components/campaigns/campaign-ai-quick-generate";
import { requireCurrentUserCompany } from "@/lib/auth/user-company";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const { supabase, companyId } = await requireCurrentUserCompany();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id,name,status")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Manage and launch outbound campaigns.</p>
        </div>
        <Link href="/campaigns/new">
          <Button>New Campaign</Button>
        </Link>
      </div>

      <CampaignAiQuickGenerate />

      <div className="grid gap-4 md:grid-cols-2">
        {(campaigns ?? []).length === 0 ? (
          <div className="rounded border border-dashed p-6">
            <p className="text-sm font-medium">No campaigns yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Create your first campaign to start lead generation.</p>
            <Link href="/campaigns/new" className="mt-3 inline-block text-sm text-primary underline">
              Create your first campaign
            </Link>
          </div>
        ) : (
          (campaigns ?? []).map((campaign) => (
            <CampaignCard key={campaign.id} id={campaign.id} name={campaign.name} status={campaign.status} />
          ))
        )}
      </div>
    </div>
  );
}
