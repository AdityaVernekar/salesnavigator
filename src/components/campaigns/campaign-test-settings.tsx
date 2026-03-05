"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CampaignTestSettingsProps = {
  campaignId: string;
  initialTestModeEnabled: boolean;
  initialTestRecipientEmails: string[];
};

function normalizeEmailList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map((item) => item.trim().toLowerCase())
        .filter((item) => Boolean(item)),
    ),
  );
}

export function CampaignTestSettings({
  campaignId,
  initialTestModeEnabled,
  initialTestRecipientEmails,
}: CampaignTestSettingsProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialTestModeEnabled);
  const [emailsValue, setEmailsValue] = useState(initialTestRecipientEmails.join("\n"));
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmails = useMemo(() => normalizeEmailList(emailsValue), [emailsValue]);
  const hasChanges =
    enabled !== initialTestModeEnabled ||
    normalizedEmails.join(",") !== initialTestRecipientEmails.join(",");

  const save = async () => {
    setIsSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_mode_enabled: enabled,
          test_recipient_emails: normalizedEmails,
        }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to update test settings");
      }
      setFeedback("Test sending settings updated.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update test settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded border p-3">
      <div className="flex items-center gap-2">
        <input
          id="test-mode-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          disabled={isSaving}
        />
        <Label htmlFor="test-mode-enabled">Enable test mode (divert all sends)</Label>
      </div>
      <div className="space-y-1">
        <Label htmlFor="test-recipients">Test recipient emails (comma or newline separated)</Label>
        <Textarea
          id="test-recipients"
          value={emailsValue}
          onChange={(event) => setEmailsValue(event.target.value)}
          placeholder={"qa@example.com\nteam@example.com"}
          disabled={isSaving}
        />
        <p className="text-xs text-muted-foreground">
          When enabled, campaign sends are diverted only to these recipients.
        </p>
      </div>
      <Button size="sm" onClick={save} disabled={isSaving || !hasChanges}>
        {isSaving ? "Saving..." : "Save test settings"}
      </Button>
      {feedback ? <p className="text-xs text-emerald-600">{feedback}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
