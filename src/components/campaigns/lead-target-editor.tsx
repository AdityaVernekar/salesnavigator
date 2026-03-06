"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LeadTargetEditorProps = {
  campaignId: string;
  initialLeadTarget: number;
};

export function LeadTargetEditor({
  campaignId,
  initialLeadTarget,
}: LeadTargetEditorProps) {
  const router = useRouter();
  const [leadTarget, setLeadTarget] = useState(String(initialLeadTarget));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const hasChanges = Number(leadTarget) !== initialLeadTarget;

  const saveLeadTarget = async () => {
    setIsSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads_per_run: Number(leadTarget) }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to update lead target.");
      }

      setFeedback("Lead target updated.");
      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update lead target.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-28"
          type="number"
          min={1}
          max={100}
          value={leadTarget}
          onChange={(event) => setLeadTarget(event.target.value)}
          disabled={isSaving}
        />
        <Button size="sm" onClick={saveLeadTarget} disabled={isSaving || !hasChanges}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
      {feedback ? <p className="text-xs text-emerald-600">{feedback}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
