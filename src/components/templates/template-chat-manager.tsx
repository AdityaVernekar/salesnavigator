"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Plus, Sparkles, Save, Clock, Check, Trash2 } from "lucide-react";

type TemplateVersion = {
  id: string;
  version: number;
  subject_template: string;
  body_template: string;
  placeholders: string[] | null;
  change_note?: string | null;
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

type GeneratedDraft = {
  subjectTemplate: string;
  bodyTemplate: string;
  rationale?: string | null;
  placeholders: string[];
};

export function TemplateChatManager({
  initialTemplates,
}: {
  initialTemplates: TemplateRecord[];
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRecord[]>(initialTemplates);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    initialTemplates[0]?.id ?? ""
  );

  // Editor state
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasEdits, setHasEdits] = useState(false);

  // AI generation state
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<GeneratedDraft | null>(null);

  // New template dialog
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateSubject, setNewTemplateSubject] = useState("");
  const [newTemplateBody, setNewTemplateBody] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Version history
  const [showVersions, setShowVersions] = useState(false);
  const [activatingVersionId, setActivatingVersionId] = useState<string | null>(null);

  // Feedback
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  async function deleteTemplate(templateId: string) {
    if (!confirm("Delete this template? It will be archived and no longer usable.")) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to delete template");
        return;
      }
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      if (selectedTemplateId === templateId) {
        const remaining = templates.filter((t) => t.id !== templateId);
        setSelectedTemplateId(remaining[0]?.id ?? "");
      }
      setFeedback("Template deleted");
    } catch {
      setError("Network error");
    } finally {
      setIsDeleting(false);
    }
  }

  // Load selected template content into editor
  const loadTemplateIntoEditor = useCallback((template: TemplateRecord | null) => {
    if (template?.activeVersion) {
      setEditSubject(template.activeVersion.subject_template);
      setEditBody(template.activeVersion.body_template);
    } else {
      setEditSubject("");
      setEditBody("");
    }
    setChangeNote("");
    setHasEdits(false);
    setGeneratedDraft(null);
    setError(null);
    setFeedback(null);
  }, []);

  useEffect(() => {
    loadTemplateIntoEditor(selectedTemplate);
  }, [selectedTemplateId, loadTemplateIntoEditor, selectedTemplate]);

  // Track edits
  useEffect(() => {
    if (!selectedTemplate?.activeVersion) return;
    const changed =
      editSubject !== selectedTemplate.activeVersion.subject_template ||
      editBody !== selectedTemplate.activeVersion.body_template;
    setHasEdits(changed);
  }, [editSubject, editBody, selectedTemplate]);

  const refreshTemplates = async (nextSelectedTemplateId?: string) => {
    const refreshed = await fetch("/api/templates", { method: "GET" });
    const refreshedData = (await refreshed.json()) as {
      ok: boolean;
      templates: TemplateRecord[];
    };
    if (refreshedData.ok) {
      setTemplates(refreshedData.templates ?? []);
      if (
        nextSelectedTemplateId &&
        refreshedData.templates?.some((item) => item.id === nextSelectedTemplateId)
      ) {
        setSelectedTemplateId(nextSelectedTemplateId);
      } else if (
        selectedTemplateId &&
        !refreshedData.templates?.some((item) => item.id === selectedTemplateId)
      ) {
        setSelectedTemplateId(refreshedData.templates?.[0]?.id ?? "");
      } else if (!selectedTemplateId && refreshedData.templates?.length) {
        setSelectedTemplateId(refreshedData.templates[0].id);
      }
    }
    router.refresh();
  };

  const clearFeedback = () => {
    setTimeout(() => {
      setFeedback(null);
      setError(null);
    }, 4000);
  };

  // Save edits as new version
  const saveAsNewVersion = async () => {
    if (!selectedTemplateId || !editSubject.trim() || !editBody.trim()) return;
    setIsSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/templates/${selectedTemplateId}/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectTemplate: editSubject,
            bodyTemplate: editBody,
            createdBy: "settings-templates-ui",
            changeNote: changeNote.trim() || "Edited in template manager",
            activate: true,
          }),
        }
      );
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        version?: { version: number };
      };
      if (!response.ok || !data.ok || !data.version) {
        throw new Error(data.error ?? "Failed to save version");
      }
      setFeedback(`Saved as version ${data.version.version}`);
      setChangeNote("");
      await refreshTemplates(selectedTemplateId);
      clearFeedback();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save"
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Create new template
  const createNewTemplate = async () => {
    if (
      !newTemplateName.trim() ||
      !newTemplateSubject.trim() ||
      !newTemplateBody.trim()
    )
      return;
    setIsCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          subjectTemplate: newTemplateSubject.trim(),
          bodyTemplate: newTemplateBody.trim(),
          createdBy: "settings-templates-ui",
          changeNote: "Initial version",
        }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        template?: { id: string };
        version?: { version: number };
      };
      if (!response.ok || !data.ok || !data.template) {
        throw new Error(data.error ?? "Failed to create template");
      }
      setNewTemplateOpen(false);
      setNewTemplateName("");
      setNewTemplateSubject("");
      setNewTemplateBody("");
      setFeedback("Template created");
      await refreshTemplates(data.template.id);
      clearFeedback();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create template"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // AI generate
  const submitPrompt = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch("/api/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        draft?: GeneratedDraft;
      };
      if (!response.ok || !data.ok || !data.draft) {
        throw new Error(data.error ?? "Failed to generate template");
      }
      setGeneratedDraft(data.draft);
      setFeedback("Draft generated — review below");
      clearFeedback();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to generate template"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const applyDraftToEditor = () => {
    if (!generatedDraft) return;
    setEditSubject(generatedDraft.subjectTemplate);
    setEditBody(generatedDraft.bodyTemplate);
    setGeneratedDraft(null);
    setFeedback("Draft applied to editor — save when ready");
    clearFeedback();
  };

  const saveDraftAsNewTemplate = async () => {
    if (!generatedDraft) return;
    setNewTemplateName("");
    setNewTemplateSubject(generatedDraft.subjectTemplate);
    setNewTemplateBody(generatedDraft.bodyTemplate);
    setNewTemplateOpen(true);
  };

  // Activate a specific version
  const activateVersion = async (versionId: string) => {
    if (!selectedTemplateId) return;
    setActivatingVersionId(versionId);
    try {
      const response = await fetch(
        `/api/templates/${selectedTemplateId}/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "activate", versionId }),
        }
      );
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to activate version");
      }
      setFeedback("Version activated");
      await refreshTemplates(selectedTemplateId);
      clearFeedback();
    } catch (activateError) {
      setError(
        activateError instanceof Error
          ? activateError.message
          : "Failed to activate version"
      );
    } finally {
      setActivatingVersionId(null);
    }
  };

  const placeholders = editBody
    ? [...(editBody.matchAll(/\{\{(\w+)\}\}/g) || [])].map((m) => m[1])
    : [];
  const subjectPlaceholders = editSubject
    ? [...(editSubject.matchAll(/\{\{(\w+)\}\}/g) || [])].map((m) => m[1])
    : [];
  const allPlaceholders = [...new Set([...subjectPlaceholders, ...placeholders])];

  return (
    <div className="flex gap-4">
      {/* Sidebar — template list */}
      <div className="w-72 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            Templates
          </h3>
          <Dialog open={newTemplateOpen} onOpenChange={setNewTemplateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" />
                New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Template</DialogTitle>
                <DialogDescription>
                  Create a new email template with a subject and body.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="newName">Name</Label>
                  <Input
                    id="newName"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="e.g. Outbound Intro"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newSubject">Subject</Label>
                  <Input
                    id="newSubject"
                    value={newTemplateSubject}
                    onChange={(e) => setNewTemplateSubject(e.target.value)}
                    placeholder="e.g. {{first_name}}, quick question"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newBody">Body</Label>
                  <Textarea
                    id="newBody"
                    className="min-h-32"
                    value={newTemplateBody}
                    onChange={(e) => setNewTemplateBody(e.target.value)}
                    placeholder="Hi {{first_name}},&#10;&#10;I noticed..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={createNewTemplate}
                  disabled={
                    isCreating ||
                    !newTemplateName.trim() ||
                    !newTemplateSubject.trim() ||
                    !newTemplateBody.trim()
                  }
                >
                  {isCreating ? "Creating..." : "Create Template"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-1">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                template.id === selectedTemplateId
                  ? "border-primary bg-accent"
                  : "border-transparent"
              )}
              onClick={() => setSelectedTemplateId(template.id)}
            >
              <p className="font-medium truncate">{template.name}</p>
              <p className="text-xs text-muted-foreground">
                {template.versions.length} version
                {template.versions.length !== 1 ? "s" : ""}
              </p>
            </button>
          ))}
          {templates.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No templates yet. Create one to get started.
            </p>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Feedback bar */}
        {feedback && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
            {feedback}
          </div>
        )}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {selectedTemplate ? (
          <Tabs defaultValue="editor">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{selectedTemplate.name}</h2>
                  {selectedTemplate.activeVersion && (
                    <p className="text-xs text-muted-foreground">
                      Active: v{selectedTemplate.activeVersion.version} &middot;
                      Created{" "}
                      {new Date(
                        selectedTemplate.activeVersion.created_at
                      ).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteTemplate(selectedTemplate.id)}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <TabsList>
                <TabsTrigger value="editor">Editor</TabsTrigger>
                <TabsTrigger value="generate">
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  AI Generate
                </TabsTrigger>
                <TabsTrigger
                  value="versions"
                  onClick={() => setShowVersions(true)}
                >
                  <Clock className="mr-1 h-3.5 w-3.5" />
                  Versions ({selectedTemplate.versions.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Editor Tab */}
            <TabsContent value="editor" className="space-y-4">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="editSubject">Subject</Label>
                    <Input
                      id="editSubject"
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="editBody">Body</Label>
                    <Textarea
                      id="editBody"
                      className="min-h-48 font-mono text-sm"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      disabled={isSaving}
                    />
                  </div>

                  {allPlaceholders.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-muted-foreground mr-1">
                        Placeholders:
                      </span>
                      {allPlaceholders.map((p) => (
                        <Badge key={p} variant="secondary" className="text-xs">
                          {`{{${p}}}`}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {hasEdits && (
                    <div className="flex items-end gap-3 border-t pt-4">
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor="changeNote">
                          Change note{" "}
                          <span className="text-muted-foreground font-normal">
                            (optional)
                          </span>
                        </Label>
                        <Input
                          id="changeNote"
                          value={changeNote}
                          onChange={(e) => setChangeNote(e.target.value)}
                          placeholder="What did you change?"
                          disabled={isSaving}
                        />
                      </div>
                      <Button
                        onClick={saveAsNewVersion}
                        disabled={isSaving || !editSubject.trim() || !editBody.trim()}
                      >
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        {isSaving ? "Saving..." : "Save as New Version"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Generate Tab */}
            <TabsContent value="generate" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">AI Template Generator</CardTitle>
                  <CardDescription>
                    Describe the template you want and AI will generate a draft.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-24"
                    placeholder="Create a concise first-touch template for CTOs in fintech with a credibility-based CTA."
                    disabled={isGenerating}
                  />
                  <Button
                    onClick={submitPrompt}
                    disabled={isGenerating || !prompt.trim()}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {isGenerating ? "Generating..." : "Generate"}
                  </Button>
                </CardContent>
              </Card>

              {generatedDraft && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Generated Draft</CardTitle>
                    {generatedDraft.rationale && (
                      <CardDescription>
                        {generatedDraft.rationale}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Subject</Label>
                      <Input
                        value={generatedDraft.subjectTemplate}
                        onChange={(e) =>
                          setGeneratedDraft((prev) =>
                            prev
                              ? { ...prev, subjectTemplate: e.target.value }
                              : prev
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Body</Label>
                      <Textarea
                        className="min-h-32 font-mono text-sm"
                        value={generatedDraft.bodyTemplate}
                        onChange={(e) =>
                          setGeneratedDraft((prev) =>
                            prev
                              ? { ...prev, bodyTemplate: e.target.value }
                              : prev
                          )
                        }
                      />
                    </div>
                    {generatedDraft.placeholders.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-xs text-muted-foreground mr-1">
                          Placeholders:
                        </span>
                        {generatedDraft.placeholders.map((p) => (
                          <Badge
                            key={p}
                            variant="secondary"
                            className="text-xs"
                          >
                            {`{{${p}}}`}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button onClick={applyDraftToEditor}>
                        Apply to Editor
                      </Button>
                      <Button
                        variant="outline"
                        onClick={saveDraftAsNewTemplate}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Save as New Template
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Versions Tab */}
            <TabsContent value="versions" className="space-y-3">
              {selectedTemplate.versions
                .slice()
                .sort((a, b) => b.version - a.version)
                .map((version) => {
                  const isActive =
                    version.id === selectedTemplate.active_version_id;
                  return (
                    <Card
                      key={version.id}
                      className={cn(
                        isActive ? "border-primary" : ""
                      )}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-sm">
                              Version {version.version}
                            </CardTitle>
                            {isActive && (
                              <Badge
                                variant="default"
                                className="text-[10px] px-1.5 py-0"
                              >
                                Active
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {new Date(
                                version.created_at
                              ).toLocaleDateString()}
                            </span>
                            {!isActive && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => activateVersion(version.id)}
                                disabled={activatingVersionId === version.id}
                              >
                                <Check className="mr-1 h-3 w-3" />
                                {activatingVersionId === version.id
                                  ? "Activating..."
                                  : "Set Active"}
                              </Button>
                            )}
                          </div>
                        </div>
                        {version.change_note && (
                          <p className="text-xs text-muted-foreground">
                            {version.change_note}
                          </p>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Subject
                          </p>
                          <p className="text-sm rounded bg-muted px-2 py-1.5">
                            {version.subject_template}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Body
                          </p>
                          <pre className="text-sm rounded bg-muted px-2 py-1.5 whitespace-pre-wrap font-mono overflow-auto max-h-40">
                            {version.body_template}
                          </pre>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
            <div className="text-center">
              <p className="text-muted-foreground">
                No template selected
              </p>
              <p className="text-sm text-muted-foreground">
                Select a template from the sidebar or create a new one.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
