"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  "new",
  "enriching",
  "enriched",
  "scored",
  "emailed",
  "disqualified",
  "error",
] as const;

const TIER_OPTIONS = ["hot", "warm", "cold", "disqualified"] as const;

const SOURCE_OPTIONS = ["exa", "clado", "manual"] as const;

export function ContactsFilterForm({
  q,
  status,
  tier,
  source,
  campaignId,
  campaignOptions,
}: {
  q: string;
  status: string;
  tier: string;
  source: string;
  campaignId: string;
  campaignOptions: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(q);
  const [statusValue, setStatusValue] = useState(status);
  const [tierValue, setTierValue] = useState(tier);
  const [sourceValue, setSourceValue] = useState(source);
  const [campaignIdValue, setCampaignIdValue] = useState(campaignId);

  const applyFilters = () => {
    const params = new URLSearchParams();
    params.set("page", "1");
    const trimmed = searchQuery.trim();
    if (trimmed) params.set("q", trimmed);
    if (statusValue !== "all") params.set("status", statusValue);
    if (tierValue !== "all") params.set("tier", tierValue);
    if (sourceValue !== "all") params.set("source", sourceValue);
    if (campaignIdValue !== "all") params.set("campaignId", campaignIdValue);
    router.push(`/contacts?${params.toString()}`);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusValue("all");
    setTierValue("all");
    setSourceValue("all");
    setCampaignIdValue("all");
    router.push("/contacts?page=1");
  };

  return (
    <div className="grid gap-2 rounded border p-3 md:grid-cols-6">
      <div className="flex flex-col gap-1 text-sm">
        <Label htmlFor="contacts-search-filter" className="text-muted-foreground">
          Search
        </Label>
        <Input
          id="contacts-search-filter"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Name, company, email"
        />
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <Label className="text-muted-foreground">Status</Label>
        <Select value={statusValue} onValueChange={setStatusValue}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <Label className="text-muted-foreground">Tier</Label>
        <Select value={tierValue} onValueChange={setTierValue}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            {TIER_OPTIONS.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <Label className="text-muted-foreground">Source</Label>
        <Select value={sourceValue} onValueChange={setSourceValue}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {SOURCE_OPTIONS.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <Label className="text-muted-foreground">Campaign</Label>
        <Select value={campaignIdValue} onValueChange={setCampaignIdValue}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {campaignOptions.map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end gap-2">
        <Button type="button" onClick={applyFilters}>
          Apply
        </Button>
        <Button type="button" variant="ghost" onClick={clearFilters}>
          Clear
        </Button>
      </div>
    </div>
  );
}
