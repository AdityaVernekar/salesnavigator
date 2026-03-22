"use client";

import { useEffect, useState } from "react";
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

type Result = {
  ok: boolean;
  error?: string;
  websetId?: string;
  status?: string;
  itemCount?: number;
  items?: WebsetItem[];
  message?: string;
  leadsInserted?: number;
  contactsInserted?: number;
};

type WebsetItem = {
  id: string;
  properties: {
    type: string;
    url: string;
    description: string;
    person?: {
      name: string;
      location: string;
      position: string;
      company?: { name: string };
    };
  };
  enrichments?: Array<{
    format: string;
    status: string;
    result?: string[];
  }>;
};

type Campaign = { id: string; name: string };

export default function ExaWebsetsTestPage() {
  const [action, setAction] = useState<string>("search_people");
  const [query, setQuery] = useState("");
  const [count, setCount] = useState("5");
  const [websetId, setWebsetId] = useState("");
  const [pollUntilDone, setPollUntilDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [saveResult, setSaveResult] = useState<Result | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/campaigns")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCampaigns(data);
        else if (data.campaigns) setCampaigns(data.campaigns);
      })
      .catch(() => {});
  }, []);

  const run = async () => {
    setLoading(true);
    setResult(null);
    setSaveResult(null);
    setSelectedItems(new Set());
    try {
      const res = await fetch("/api/test/exa-websets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          query: query || undefined,
          count: count ? Number(count) : undefined,
          websetId: websetId || undefined,
          pollUntilDone,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.websetId) setWebsetId(data.websetId);
      if (data.items?.length) {
        setSelectedItems(new Set(data.items.map((_: unknown, i: number) => i)));
      }
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (index: number) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (!result?.items) return;
    if (selectedItems.size === result.items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(result.items.map((_, i) => i)));
    }
  };

  const saveAsLeads = async () => {
    if (!result?.items || !selectedCampaign || selectedItems.size === 0) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const itemsToSave = result.items.filter((_, i) => selectedItems.has(i));
      const res = await fetch("/api/test/exa-websets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_as_leads",
          campaignId: selectedCampaign,
          items: itemsToSave,
        }),
      });
      const data = await res.json();
      setSaveResult(data);
    } catch (err) {
      setSaveResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const getEmail = (item: WebsetItem) => {
    for (const e of item.enrichments ?? []) {
      if (e.format === "email" && e.result?.length) return e.result[0];
    }
    return null;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">Exa Websets Test</h1>

      <div className="space-y-4 rounded-lg border p-4">
        <div className="space-y-2">
          <Label>Action</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="search_people">Search People</SelectItem>
              <SelectItem value="search_companies">Search Companies</SelectItem>
              <SelectItem value="get_status">Get Webset Status</SelectItem>
              <SelectItem value="get_items">Get Webset Items</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(action === "search_people" || action === "search_companies") && (
          <>
            <div className="space-y-2">
              <Label>Query</Label>
              <Input
                placeholder="e.g. CTOs at Series B SaaS companies in India"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Count</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pollUntilDone}
                onChange={(e) => setPollUntilDone(e.target.checked)}
              />
              Poll until done (will wait up to ~5 min)
            </label>
          </>
        )}

        {(action === "get_status" || action === "get_items") && (
          <div className="space-y-2">
            <Label>Webset ID</Label>
            <Input
              placeholder="webset id"
              value={websetId}
              onChange={(e) => setWebsetId(e.target.value)}
            />
          </div>
        )}

        <Button onClick={run} disabled={loading}>
          {loading ? "Running..." : "Run"}
        </Button>
      </div>

      {result?.ok && result.items && result.items.length > 0 && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              Results ({result.items.length} items, {selectedItems.size} selected)
            </h2>
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selectedItems.size === result.items.length ? "Deselect all" : "Select all"}
            </Button>
          </div>

          <div className="space-y-2">
            {result.items.map((item, i) => {
              const person = item.properties?.person;
              const email = getEmail(item);
              return (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedItems.has(i)}
                    onChange={() => toggleItem(i)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{person?.name ?? "Unknown"}</span>
                      <span className="text-xs text-muted-foreground">{person?.position}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {person?.company?.name}
                      {person?.location ? ` · ${person.location}` : ""}
                    </div>
                    {email && <div className="text-sm text-blue-600">{email}</div>}
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex items-end gap-4 border-t pt-4">
            <div className="flex-1 space-y-2">
              <Label>Save to Campaign</Label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a campaign..." />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={saveAsLeads}
              disabled={saving || !selectedCampaign || selectedItems.size === 0}
            >
              {saving
                ? "Saving..."
                : `Save ${selectedItems.size} as Leads & Contacts`}
            </Button>
          </div>

          {saveResult && (
            <div
              className={`rounded-md p-3 text-sm ${saveResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
            >
              {saveResult.ok
                ? `Saved ${saveResult.leadsInserted} leads and ${saveResult.contactsInserted} contacts`
                : `Error: ${saveResult.error}`}
            </div>
          )}
        </div>
      )}

      {result && (
        <details className="rounded-lg border">
          <summary className="cursor-pointer p-4 text-sm font-medium">
            Raw JSON
            {result.ok ? (
              <span className="ml-2 text-green-600">SUCCESS</span>
            ) : (
              <span className="ml-2 text-red-600">ERROR: {result.error}</span>
            )}
          </summary>
          <pre className="max-h-[600px] overflow-auto border-t p-4 text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
