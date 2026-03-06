"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TemplateVersion = {
  id: string;
  version: number;
  subject_template: string;
  body_template: string;
  placeholders: string[] | null;
  created_at: string;
};

type TemplateRecord = {
  id: string;
  name: string;
  status: "active" | "archived";
  active_version_id: string | null;
  versions: TemplateVersion[];
  activeVersion: TemplateVersion | null;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type GeneratedDraft = {
  subjectTemplate: string;
  bodyTemplate: string;
  placeholders: string[];
};

export function TemplateChatManager({
  initialTemplates,
}: {
  initialTemplates: TemplateRecord[];
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRecord[]>(initialTemplates);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialTemplates[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [saveAsVersion, setSaveAsVersion] = useState(true);
  const [generatedDraft, setGeneratedDraft] = useState<GeneratedDraft | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refreshTemplates = async (nextSelectedTemplateId?: string) => {
    const refreshed = await fetch("/api/templates", { method: "GET" });
    const refreshedData = (await refreshed.json()) as { ok: boolean; templates: TemplateRecord[] };
    if (refreshedData.ok) {
      setTemplates(refreshedData.templates ?? []);
      if (nextSelectedTemplateId) {
        setSelectedTemplateId(nextSelectedTemplateId);
      } else if (!selectedTemplateId && refreshedData.templates?.length) {
        setSelectedTemplateId(refreshedData.templates[0].id);
      }
    }
    router.refresh();
  };

  const submitPrompt = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    setFeedback(null);
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    try {
      const response = await fetch("/api/templates/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          templateId: selectedTemplateId || undefined,
          templateName: templateName || undefined,
          saveAsVersion,
          createdBy: "settings-templates-ui",
        }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        draft?: { subjectTemplate: string; bodyTemplate: string; placeholders: string[] };
        persisted?: { kind: string; templateId: string; versionId: string; version: number } | null;
      };
      if (!response.ok || !data.ok || !data.draft) {
        throw new Error(data.error ?? "Failed to generate template");
      }
      const draft = data.draft;
      setGeneratedDraft(draft);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Subject: ${draft.subjectTemplate}\n\nBody:\n${draft.bodyTemplate}`,
        },
      ]);
      setPrompt("");
      if (data.persisted) {
        setFeedback(`Saved ${data.persisted.kind} version v${data.persisted.version}.`);
        await refreshTemplates(data.persisted.templateId);
      } else {
        setFeedback("Draft generated. Use the save buttons below to store it.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to generate template");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveGeneratedDraft = async (mode: "new_template" | "new_version") => {
    if (!generatedDraft) return;
    setIsSavingDraft(true);
    setError(null);
    setFeedback(null);
    try {
      if (mode === "new_template") {
        if (!templateName.trim()) {
          throw new Error("Enter a template name before saving as a new template.");
        }
        const response = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: templateName.trim(),
            subjectTemplate: generatedDraft.subjectTemplate,
            bodyTemplate: generatedDraft.bodyTemplate,
            promptContext: prompt || undefined,
            createdBy: "settings-templates-ui",
            changeNote: "Saved from generated draft",
          }),
        });
        const data = (await response.json()) as {
          ok: boolean;
          error?: string;
          template?: { id: string };
          version?: { version: number };
        };
        if (!response.ok || !data.ok || !data.template || !data.version) {
          throw new Error(data.error ?? "Failed to save template");
        }
        setFeedback(`Saved new template (v${data.version.version}).`);
        await refreshTemplates(data.template.id);
        return;
      }

      if (!selectedTemplateId) {
        throw new Error("Select an existing template to save this as a new version.");
      }
      const response = await fetch(`/api/templates/${selectedTemplateId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectTemplate: generatedDraft.subjectTemplate,
          bodyTemplate: generatedDraft.bodyTemplate,
          promptContext: prompt || undefined,
          createdBy: "settings-templates-ui",
          changeNote: "Saved from generated draft",
          activate: true,
        }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string; version?: { version: number } };
      if (!response.ok || !data.ok || !data.version) {
        throw new Error(data.error ?? "Failed to save version");
      }
      setFeedback(`Saved new version v${data.version.version}.`);
      await refreshTemplates(selectedTemplateId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save draft");
    } finally {
      setIsSavingDraft(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Template Repository</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {templates.map((template) => (
              <Button
                key={template.id}
                type="button"
                variant="outline"
                className={cn(
                  "h-auto w-full justify-start px-3 py-2 text-left text-sm",
                  template.id === selectedTemplateId ? "border-primary" : "",
                )}
                onClick={() => {
                  setSelectedTemplateId(template.id);
                }}
              >
                <div>
                  <p className="font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">Versions: {template.versions.length}</p>
                </div>
              </Button>
            ))}
          {templates.length === 0 ? <p className="text-sm text-muted-foreground">No templates yet.</p> : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Template Chat Builder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="templateName">New Template Name (when creating)</Label>
              <Input
                id="templateName"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Outbound Intro v1"
                disabled={isGenerating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chatPrompt">Instruction</Label>
              <Textarea
                id="chatPrompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-28"
                placeholder="Create a concise first-touch template for CTOs in fintech with a credibility-based CTA."
                disabled={isGenerating}
              />
            </div>
            <Label className="flex items-center gap-2 text-sm font-normal">
              <Checkbox checked={saveAsVersion} onCheckedChange={(value) => setSaveAsVersion(Boolean(value))} disabled={isGenerating} />
              Save generated output to DB
            </Label>
            <Button type="button" onClick={submitPrompt} disabled={isGenerating || !prompt.trim()}>
              {isGenerating ? "Generating..." : "Generate Template"}
            </Button>

            {messages.length > 0 ? (
              <div className="space-y-2 rounded border p-3">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className="rounded bg-muted/40 p-2 text-sm">
                    <p className="mb-1 font-medium capitalize">{message.role}</p>
                    <pre className="whitespace-pre-wrap text-xs">{message.content}</pre>
                  </div>
                ))}
              </div>
            ) : null}

            {generatedDraft ? (
              <div className="space-y-2 rounded border p-3">
                <p className="text-sm font-medium">Latest Generated Draft</p>
                <div className="space-y-2">
                  <Label htmlFor="generatedSubject">Subject</Label>
                  <Input
                    id="generatedSubject"
                    value={generatedDraft.subjectTemplate}
                    onChange={(event) =>
                      setGeneratedDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              subjectTemplate: event.target.value,
                            }
                          : prev,
                      )
                    }
                    disabled={isSavingDraft}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="generatedBody">Body HTML</Label>
                  <Textarea
                    id="generatedBody"
                    className="min-h-32"
                    value={generatedDraft.bodyTemplate}
                    onChange={(event) =>
                      setGeneratedDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              bodyTemplate: event.target.value,
                            }
                          : prev,
                      )
                    }
                    disabled={isSavingDraft}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => saveGeneratedDraft("new_template")} disabled={isSavingDraft}>
                    {isSavingDraft ? "Saving..." : "Save as New Template"}
                  </Button>
                  <Button type="button" onClick={() => saveGeneratedDraft("new_version")} disabled={isSavingDraft || !selectedTemplateId}>
                    {isSavingDraft ? "Saving..." : "Save as New Version"}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {feedback ? <p className="text-sm text-emerald-600">{feedback}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
