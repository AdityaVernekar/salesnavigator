"use client";

import { useEffect, useMemo, useState } from "react";
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

type TemplateVersion = {
  id: string;
  version: number;
  created_at: string;
};

type TemplateRecord = {
  id: string;
  name: string;
  versions: TemplateVersion[];
};

export function CampaignAbTestConfig({
  campaignId,
  activeExperimentId,
}: {
  campaignId: string;
  activeExperimentId: string | null;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const response = await fetch("/api/templates");
        const data = (await response.json()) as {
          ok: boolean;
          templates?: Array<{
            id: string;
            name: string;
            versions: TemplateVersion[];
          }>;
          error?: string;
        };
        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? "Failed to load templates");
        }
        setTemplates(data.templates ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load templates");
      } finally {
        setIsLoading(false);
      }
    };
    void loadTemplates();
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  const toggleVariant = (versionId: string) => {
    setSelectedVersionIds((prev) =>
      prev.includes(versionId) ? prev.filter((item) => item !== versionId) : [...prev, versionId],
    );
  };

  const createExperiment = async () => {
    if (!selectedTemplateId || selectedVersionIds.length < 2) {
      setError("Select a template and at least two versions.");
      return;
    }
    setIsCreating(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch("/api/template-experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          templateId: selectedTemplateId,
          variantVersionIds: selectedVersionIds,
          explorationRate: 0.2,
          minSampleSize: 20,
        }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to create A/B experiment");
      }
      setFeedback("A/B experiment created and linked to this campaign.");
      setSelectedVersionIds([]);
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create A/B experiment");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-3 rounded border p-3">
      <p className="text-sm font-medium">Cold Email A/B Test (Campaign-Level)</p>
      <p className="text-xs text-muted-foreground">
        Configure A/B variants here before running pipeline. Active experiment: {activeExperimentId ?? "none"}.
      </p>
      <Select
        value={selectedTemplateId}
        onValueChange={(value) => {
          setSelectedTemplateId(value);
          setSelectedVersionIds([]);
        }}
        disabled={isLoading || isCreating}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={isLoading ? "Loading templates..." : "Select template"} />
        </SelectTrigger>
        <SelectContent>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="space-y-1">
        <p className="text-xs font-medium">Pick Variants (at least 2)</p>
        {(selectedTemplate?.versions ?? []).map((version) => (
          <Label key={version.id} className="flex items-center gap-2 text-xs font-normal">
            <Checkbox
              checked={selectedVersionIds.includes(version.id)}
              onCheckedChange={() => toggleVariant(version.id)}
              disabled={isCreating}
            />
            v{version.version} - {new Date(version.created_at).toLocaleDateString()}
          </Label>
        ))}
        {selectedTemplate && selectedTemplate.versions.length < 2 ? (
          <p className="text-xs text-muted-foreground">Need at least 2 versions on this template.</p>
        ) : null}
      </div>
      <Button type="button" variant="outline" onClick={createExperiment} disabled={isCreating || isLoading}>
        {isCreating ? "Creating..." : "Create Campaign A/B Experiment"}
      </Button>
      {feedback ? <p className="text-xs text-emerald-600">{feedback}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
