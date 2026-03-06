"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Mailbox = {
  id: string;
  gmail_address: string;
  is_active: boolean | null;
};

export function CampaignMailboxAssignment({
  campaignId,
  mailboxes,
  initialAccountIds,
  initialMailboxSelectionMode,
  initialPrimaryAccountId,
  initialTemplateExperimentId,
  templateExperiments,
}: {
  campaignId: string;
  mailboxes: Mailbox[];
  initialAccountIds: string[];
  initialMailboxSelectionMode: "explicit_single" | "round_robin" | "least_loaded";
  initialPrimaryAccountId: string | null;
  initialTemplateExperimentId: string | null;
  templateExperiments: Array<{ id: string; status: string }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initialAccountIds);
  const [mailboxSelectionMode, setMailboxSelectionMode] = useState<
    "explicit_single" | "round_robin" | "least_loaded"
  >(initialMailboxSelectionMode);
  const [primaryAccountId, setPrimaryAccountId] = useState<string>(initialPrimaryAccountId ?? "");
  const [templateExperimentId, setTemplateExperimentId] = useState<string>(initialTemplateExperimentId ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasChanges = useMemo(
    () =>
      selected.slice().sort().join(",") !== initialAccountIds.slice().sort().join(",") ||
      mailboxSelectionMode !== initialMailboxSelectionMode ||
      primaryAccountId !== (initialPrimaryAccountId ?? "") ||
      templateExperimentId !== (initialTemplateExperimentId ?? ""),
    [
      initialAccountIds,
      initialMailboxSelectionMode,
      initialPrimaryAccountId,
      initialTemplateExperimentId,
      mailboxSelectionMode,
      primaryAccountId,
      selected,
      templateExperimentId,
    ],
  );

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const save = async () => {
    setIsSaving(true);
    setFeedback(null);
    setError(null);
    try {
      if (mailboxSelectionMode === "explicit_single" && !primaryAccountId) {
        throw new Error("Primary mailbox is required for explicit single mode.");
      }
      const response = await fetch(`/api/campaigns/${campaignId}/mailboxes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountIds: selected,
          mailboxSelectionMode,
          primaryAccountId: primaryAccountId || null,
          templateExperimentId: templateExperimentId || null,
        }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to update mailbox assignment.");
      }
      setFeedback("Mailbox assignment saved.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update mailbox assignment.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!mailboxes.length) {
    return <p className="text-sm text-muted-foreground">No active mailboxes available. Add one in settings.</p>;
  }

  return (
    <div className="space-y-2">
      {mailboxes.map((mailbox) => (
        <Label key={mailbox.id} className="flex items-center gap-2 text-sm font-normal">
          <Checkbox checked={selected.includes(mailbox.id)} onCheckedChange={() => toggle(mailbox.id)} disabled={isSaving} />
          {mailbox.gmail_address}
        </Label>
      ))}
      <Button size="sm" variant="outline" onClick={save} disabled={isSaving || !hasChanges}>
        {isSaving ? "Saving..." : "Save mailbox assignment"}
      </Button>
      <div className="space-y-2 rounded border p-2">
        <Label className="block text-sm font-medium">Mailbox mode</Label>
        <Select
          value={mailboxSelectionMode}
          onValueChange={(value) =>
            setMailboxSelectionMode(value as "explicit_single" | "round_robin" | "least_loaded")
          }
          disabled={isSaving}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="least_loaded">Least loaded</SelectItem>
            <SelectItem value="round_robin">Round robin</SelectItem>
            <SelectItem value="explicit_single">Explicit single</SelectItem>
          </SelectContent>
        </Select>
        <Label className="block text-sm font-medium">Primary mailbox</Label>
        <Select
          value={primaryAccountId || "__none"}
          onValueChange={(value) => setPrimaryAccountId(value === "__none" ? "" : value)}
          disabled={isSaving}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">None</SelectItem>
            {mailboxes.map((mailbox) => (
              <SelectItem key={mailbox.id} value={mailbox.id}>
                {mailbox.gmail_address}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="block text-sm font-medium">Template experiment</Label>
        <Select
          value={templateExperimentId || "__none"}
          onValueChange={(value) => setTemplateExperimentId(value === "__none" ? "" : value)}
          disabled={isSaving}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">None</SelectItem>
            {templateExperiments.map((experiment) => (
              <SelectItem key={experiment.id} value={experiment.id}>
                {experiment.id.slice(0, 8)} - {experiment.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {primaryAccountId ? null : <p className="text-xs text-muted-foreground">No primary mailbox selected.</p>}
        {templateExperimentId ? null : <p className="text-xs text-muted-foreground">No template experiment linked.</p>}
      </div>
      {feedback ? <p className="text-sm text-emerald-600">{feedback}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
