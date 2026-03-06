"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LeadDetailActions({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [isResearching, setIsResearching] = useState(false);
  const [isFindingContacts, setIsFindingContacts] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerDeepResearch = async () => {
    setIsResearching(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/deep-research`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        runId?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to queue deep research.");
      }
      setFeedback(
        `Deep research queued${payload.runId ? `. Run: ${String(payload.runId).slice(0, 8)}...` : ""}.`,
      );
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to queue deep research.",
      );
    } finally {
      setIsResearching(false);
    }
  };

  const triggerFindContacts = async () => {
    setIsFindingContacts(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/find-contacts`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        runId?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to queue contact discovery.");
      }
      setFeedback(
        `Contact discovery queued${payload.runId ? `. Run: ${String(payload.runId).slice(0, 8)}...` : ""}.`,
      );
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to queue contact discovery.",
      );
    } finally {
      setIsFindingContacts(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={triggerDeepResearch}
          disabled={isResearching || isFindingContacts}
        >
          {isResearching ? "Queuing research..." : "Deep Research"}
        </Button>
        <Button
          size="sm"
          onClick={triggerFindContacts}
          disabled={isFindingContacts || isResearching}
        >
          {isFindingContacts ? "Queuing contacts..." : "Find Contacts"}
        </Button>
      </div>
      {feedback ? <p className="text-xs text-emerald-600">{feedback}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
