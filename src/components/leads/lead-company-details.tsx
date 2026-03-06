"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/leads/status-badge";
import { TruncatedTextModal } from "@/components/leads/truncated-text-modal";

const statusOptions = ["new", "enriching", "enriched", "scored", "emailed", "disqualified", "error"] as const;

type CompanyDetailsForm = {
  companyName: string;
  companyDomain: string;
  source: string;
  status: string;
  companyDescription: string;
  fitReasoning: string;
  researchedAt: string;
};

function formatIsoToLocalDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - offset);
  return local.toISOString().slice(0, 16);
}

function normalizeResearchedAt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatResearchedAtForDisplay(value: string) {
  const iso = normalizeResearchedAt(value);
  if (!iso) return "Never";
  return iso.replace("T", " ").replace(".000Z", " UTC");
}

function toWebsiteHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function LeadCompanyDetails({
  leadId,
  companyName,
  companyDomain,
  source,
  status,
  companyDescription,
  fitReasoning,
  researchedAt,
}: {
  leadId: string | null;
  companyName: string;
  companyDomain: string;
  source: string;
  status: string;
  companyDescription: string;
  fitReasoning: string;
  researchedAt: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [savedValues, setSavedValues] = useState<CompanyDetailsForm>({
    companyName,
    companyDomain,
    source,
    status,
    companyDescription,
    fitReasoning,
    researchedAt: researchedAt ? formatIsoToLocalDateTime(researchedAt) : "",
  });
  const [form, setForm] = useState<CompanyDetailsForm>(savedValues);

  const canEdit = Boolean(leadId);
  const websiteHref = toWebsiteHref(form.companyDomain);

  function updateField<K extends keyof CompanyDetailsForm>(key: K, value: CompanyDetailsForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function cancelEdit() {
    setForm(savedValues);
    setError(null);
    setFeedback(null);
    setIsEditing(false);
  }

  async function saveDetails() {
    if (!leadId) return;
    setIsSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.companyName,
          company_domain: form.companyDomain,
          source: form.source,
          status: form.status,
          company_description: form.companyDescription,
          fit_reasoning: form.fitReasoning,
          researched_at: normalizeResearchedAt(form.researchedAt),
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to update company details.");
      }
      setSavedValues(form);
      setFeedback("Company details updated.");
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update company details.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          isEditing ? (
            <>
              <Button type="button" size="sm" onClick={() => void saveDetails()} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={cancelEdit} disabled={isSaving}>
                Cancel
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              Edit Company
            </Button>
          )
        ) : null}
      </div>

      <p>
        <strong>Lead ID:</strong> {leadId ?? "Unknown"}
      </p>
      <p>
        <strong>Company:</strong>{" "}
        {isEditing ? (
          <Input
            value={form.companyName}
            placeholder="Company name"
            onChange={(event) => updateField("companyName", event.target.value)}
          />
        ) : (
          form.companyName || "Unknown"
        )}
      </p>
      <p>
        <strong>Domain:</strong>{" "}
        {isEditing ? (
          <Input
            value={form.companyDomain}
            placeholder="company.com"
            onChange={(event) => updateField("companyDomain", event.target.value)}
          />
        ) : websiteHref ? (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {form.companyDomain}
          </a>
        ) : (
          "Unknown"
        )}
      </p>
      <p className="flex items-center gap-2">
        <strong>Source:</strong>{" "}
        {isEditing ? (
          <Input value={form.source} placeholder="Source" onChange={(event) => updateField("source", event.target.value)} />
        ) : (
          <Badge variant="outline" className="uppercase">
            {form.source || "unknown"}
          </Badge>
        )}
      </p>
      <p className="flex items-center gap-2">
        <strong>Status:</strong>{" "}
        {isEditing ? (
          <Select value={form.status || "new"} onValueChange={(value) => updateField("status", value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <StatusBadge status={form.status || "new"} />
        )}
      </p>
      <p>
        <strong>Company Description:</strong>{" "}
        {isEditing ? (
          <Textarea
            value={form.companyDescription}
            placeholder="Company description"
            onChange={(event) => updateField("companyDescription", event.target.value)}
          />
        ) : (
          <TruncatedTextModal
            text={form.companyDescription}
            fallback="Not researched yet"
            modalTitle="Company Description"
            modalDescription={form.companyName || "Lead"}
            previewLength={220}
            previewClassName="mt-1 block max-h-16 max-w-full overflow-hidden line-clamp-3 wrap-break-word"
          />
        )}
      </p>
      <p>
        <strong>Fit Reasoning:</strong>{" "}
        {isEditing ? (
          <Textarea
            value={form.fitReasoning}
            placeholder="Fit reasoning"
            onChange={(event) => updateField("fitReasoning", event.target.value)}
          />
        ) : (
          <TruncatedTextModal
            text={form.fitReasoning}
            fallback="Not researched yet"
            modalTitle="Fit Reasoning"
            modalDescription={form.companyName || "Lead"}
            previewLength={220}
            previewClassName="mt-1 block max-h-16 max-w-full overflow-hidden line-clamp-3 wrap-break-word"
          />
        )}
      </p>
      <p>
        <strong>Last Researched:</strong>{" "}
        {isEditing ? (
          <Input
            type="datetime-local"
            value={form.researchedAt}
            onChange={(event) => updateField("researchedAt", event.target.value)}
          />
        ) : (
          formatResearchedAtForDisplay(form.researchedAt)
        )}
      </p>
      {feedback ? <p className="text-xs text-emerald-600">{feedback}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
