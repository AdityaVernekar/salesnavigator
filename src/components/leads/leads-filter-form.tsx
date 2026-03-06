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

export function LeadsFilterForm({
  status,
  source,
  q,
  campaignId,
  campaignOptions,
  statusOptions,
  sourceOptions,
}: {
  status: string;
  source: string;
  q: string;
  campaignId: string;
  campaignOptions: Array<{ id: string; name: string }>;
  statusOptions: readonly string[];
  sourceOptions: readonly string[];
}) {
  const router = useRouter();
  const [companyQuery, setCompanyQuery] = useState(q);
  const [statusValue, setStatusValue] = useState(status);
  const [sourceValue, setSourceValue] = useState(source);
  const [campaignIdValue, setCampaignIdValue] = useState(campaignId);

  const applyFilters = () => {
    const params = new URLSearchParams();
    params.set("page", "1");
    const trimmedQuery = companyQuery.trim();
    if (trimmedQuery) params.set("q", trimmedQuery);
    if (statusValue !== "all") params.set("status", statusValue);
    if (sourceValue !== "all") params.set("source", sourceValue);
    if (campaignIdValue !== "all") params.set("campaignId", campaignIdValue);
    router.push(`/leads?${params.toString()}`);
  };

  const clearFilters = () => {
    setCompanyQuery("");
    setStatusValue("all");
    setSourceValue("all");
    setCampaignIdValue("all");
    router.push("/leads?page=1");
  };

  return (
    <div className="grid gap-2 rounded border p-3 md:grid-cols-5">
      <div className="flex flex-col gap-1 text-sm">
        <Label htmlFor="company-filter" className="text-muted-foreground">
          Company
        </Label>
        <Input
          id="company-filter"
          value={companyQuery}
          onChange={(event) => setCompanyQuery(event.target.value)}
          placeholder="Search company name"
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
            {statusOptions.map((item) => (
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
            {sourceOptions.map((item) => (
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
