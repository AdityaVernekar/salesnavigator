"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

type ScoringFormDefaults = {
  scoringRubric?: string;
  hotThreshold?: number;
  warmThreshold?: number;
};

export function ScoringForm({ defaults }: { defaults?: ScoringFormDefaults }) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="scoring_rubric">Scoring Rubric</Label>
        <Textarea
          id="scoring_rubric"
          name="scoring_rubric"
          placeholder="+20 decision maker, +10 funding..."
          defaultValue={defaults?.scoringRubric}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="hot_threshold">Hot Threshold</Label>
          <Input
            id="hot_threshold"
            name="hot_threshold"
            type="number"
            defaultValue={defaults?.hotThreshold ?? 75}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="warm_threshold">Warm Threshold</Label>
          <Input
            id="warm_threshold"
            name="warm_threshold"
            type="number"
            defaultValue={defaults?.warmThreshold ?? 50}
          />
        </div>
      </div>
    </div>
  );
}
