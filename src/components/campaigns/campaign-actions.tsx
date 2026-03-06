"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type CampaignActionsProps = {
  campaignId: string;
  status: string;
};

export function CampaignActions({ campaignId, status }: CampaignActionsProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const updateStatus = async (nextStatus: "active" | "paused") => {
    setIsPending(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to update campaign status.");
      }
      setFeedback(`Campaign status updated to ${nextStatus}.`);
      router.refresh();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Failed to update campaign status.");
    } finally {
      setIsPending(false);
    }
  };

  const launchCampaign = async () => {
    setIsPending(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/launch`, {
        method: "POST",
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to launch campaign.");
      }
      setFeedback("Campaign launched successfully.");
      router.refresh();
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : "Failed to launch campaign.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 pt-2">
        {status === "draft" ? (
          <Button size="sm" onClick={launchCampaign} disabled={isPending}>
            {isPending ? "Launching..." : "Launch Campaign"}
          </Button>
        ) : null}
        <Button size="sm" onClick={() => updateStatus("active")} disabled={isPending || status === "active"}>
          {isPending ? "Saving..." : "Resume"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => updateStatus("paused")}
          disabled={isPending || status === "paused"}
        >
          {isPending ? "Saving..." : "Pause"}
        </Button>
      </div>
      {feedback ? <p className="text-sm text-emerald-600">{feedback}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
