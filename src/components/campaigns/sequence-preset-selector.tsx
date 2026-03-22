"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  WORKFLOW_PRESETS,
  CATEGORY_LABELS,
  type WorkflowPreset,
} from "@/lib/workflows/presets";

function totalDays(preset: WorkflowPreset) {
  return preset.steps.reduce((max, s) => Math.max(max, s.delay_days), 0);
}

export function SequencePresetSelector({
  onSelect,
  onSkip,
}: {
  onSelect: (preset: WorkflowPreset) => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Start with a sequence template</h3>
        <p className="text-sm text-muted-foreground">
          Choose a proven outreach pattern, then customize it to fit your campaign.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WORKFLOW_PRESETS.map((preset) => (
          <Card
            key={preset.id}
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => onSelect(preset)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {preset.name}
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {CATEGORY_LABELS[preset.category]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {preset.description}
              </p>
              <p className="text-xs font-medium">
                {preset.steps.length} steps &middot; {totalDays(preset)} days
              </p>
              {/* Mini timeline */}
              <div className="flex items-center gap-1 pt-1">
                {preset.steps.map((step, i) => (
                  <div key={i} className="flex items-center">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    {i < preset.steps.length - 1 && (
                      <div className="h-px w-4 bg-border" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t pt-3">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Start from scratch
        </Button>
        <span className="text-xs text-muted-foreground">
          Begin with a single empty step
        </span>
      </div>
    </div>
  );
}
