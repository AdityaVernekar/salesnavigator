"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type GeneratedCampaignDraft = {
  name: string;
  icp_description: string;
  scoring_rubric: string;
  hot_threshold: number;
  warm_threshold: number;
  value_prop: string;
  daily_send_limit: number;
  lead_target: number;
};

type GenerateResponse =
  | { ok: true; draft: GeneratedCampaignDraft }
  | { ok: false; error: string };

function toPrefillQuery(draft: GeneratedCampaignDraft) {
  const params = new URLSearchParams();
  params.set("name", draft.name);
  params.set("icp_description", draft.icp_description);
  params.set("scoring_rubric", draft.scoring_rubric);
  params.set("hot_threshold", String(draft.hot_threshold));
  params.set("warm_threshold", String(draft.warm_threshold));
  params.set("value_prop", draft.value_prop);
  params.set("daily_send_limit", String(draft.daily_send_limit));
  params.set("lead_target", String(draft.lead_target));
  return params.toString();
}

export function CampaignAiQuickGenerate() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Enter a prompt to generate campaign details.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const payload = (await response.json()) as GenerateResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to generate strategy details." : payload.error);
      }

      router.push(`/campaigns/new?${toPrefillQuery(payload.draft)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate strategy details.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Quick generate with AI</h2>
        <p className="text-xs text-muted-foreground">
          Describe your campaign in plain language. We will draft strategy fields for review.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="campaign_ai_prompt">Prompt</Label>
        <Textarea
          id="campaign_ai_prompt"
          placeholder="Example: Launch a campaign for US fintech CFOs at Series B startups promoting our AI revenue forecasting platform."
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div>
        <Button type="button" onClick={handleGenerate} disabled={isLoading}>
          {isLoading ? "Generating..." : "Generate strategy details"}
        </Button>
      </div>
    </div>
  );
}
