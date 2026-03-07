"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TruncatedTextModal } from "@/components/leads/truncated-text-modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface EditableContactRow {
  id: string;
  name: string;
  company: string;
  email: string;
  headline: string;
  linkedinUrl: string;
  score: number | null;
  tier: string | null;
  reasoning: string | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";
type ContactTier = "hot" | "warm" | "cold" | "disqualified";
const TIER_OPTIONS: ContactTier[] = ["hot", "warm", "cold", "disqualified"];

export function ContactsEditableTable({
  contacts,
}: {
  contacts: EditableContactRow[];
}) {
  const [rows, setRows] = useState<EditableContactRow[]>(contacts);
  const [isEditing, setIsEditing] = useState(false);
  const [statusById, setStatusById] = useState<Record<string, SaveStatus>>({});
  const [errorById, setErrorById] = useState<Record<string, string | null>>({});
  const [dirtyById, setDirtyById] = useState<Record<string, boolean>>({});
  const rowsRef = useRef(rows);

  useEffect(() => {
    setRows(contacts);
    setDirtyById({});
    setStatusById({});
    setErrorById({});
  }, [contacts]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  async function saveRow(contactId: string) {
    if (!dirtyById[contactId]) return true;
    const row = rowsRef.current.find((item) => item.id === contactId);
    if (!row) return true;

    setStatusById((prev) => ({ ...prev, [contactId]: "saving" }));
    setErrorById((prev) => ({ ...prev, [contactId]: null }));

    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: row.name,
          email: row.email,
          headline: row.headline,
          linkedin_url: row.linkedinUrl,
          company_name: row.company,
          score: row.score,
          tier: row.tier,
          reasoning: row.reasoning,
        }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        contact?: {
          id: string;
          name: string | null;
          email: string | null;
          headline: string | null;
          linkedin_url: string | null;
          company_name: string | null;
          score: number | null;
          tier: string | null;
          reasoning: string | null;
        };
      };

      if (!response.ok || !payload.ok || !payload.contact) {
        throw new Error(payload.error ?? "Failed to save contact");
      }

      setRows((prev) =>
        prev.map((item) =>
          item.id === contactId
            ? {
                ...item,
                name: payload.contact?.name ?? "",
                email: payload.contact?.email ?? "",
                headline: payload.contact?.headline ?? "",
                linkedinUrl: payload.contact?.linkedin_url ?? "",
                company: payload.contact?.company_name ?? "",
                score:
                  typeof payload.contact?.score === "number"
                    ? payload.contact.score
                    : null,
                tier: payload.contact?.tier ?? null,
                reasoning: payload.contact?.reasoning ?? null,
              }
            : item,
        ),
      );
      setStatusById((prev) => ({ ...prev, [contactId]: "saved" }));
      setDirtyById((prev) => ({ ...prev, [contactId]: false }));
      return true;
    } catch (error) {
      setStatusById((prev) => ({ ...prev, [contactId]: "error" }));
      setErrorById((prev) => ({
        ...prev,
        [contactId]: error instanceof Error ? error.message : "Save failed",
      }));
      return false;
    }
  }

  function updateField(
    contactId: string,
    field: keyof EditableContactRow,
    value: EditableContactRow[keyof EditableContactRow],
  ) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === contactId ? { ...row, [field]: value } : row,
      ),
    );
    setDirtyById((prev) => ({ ...prev, [contactId]: true }));
    setStatusById((prev) => ({ ...prev, [contactId]: "idle" }));
    setErrorById((prev) => ({ ...prev, [contactId]: null }));
  }

  function statusLabel(contactId: string) {
    const status = statusById[contactId] ?? "idle";
    if (status === "idle" && dirtyById[contactId]) return "Unsaved";
    if (status === "saving") return "Saving...";
    if (status === "saved") return "Saved";
    if (status === "error") return "Error";
    return "";
  }

  function toExternalUrl(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  async function handleEditToggle() {
    if (!isEditing) {
      setIsEditing(true);
      return;
    }

    const dirtyIds = rowsRef.current
      .map((row) => row.id)
      .filter((id) => dirtyById[id]);

    if (!dirtyIds.length) {
      setIsEditing(false);
      return;
    }

    let allSaved = true;
    for (const id of dirtyIds) {
      const ok = await saveRow(id);
      if (!ok) allSaved = false;
    }

    if (allSaved) {
      setIsEditing(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant={isEditing ? "secondary" : "outline"}
          onClick={() => void handleEditToggle()}
        >
          {isEditing ? "Done" : "Edit"}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Headline</TableHead>
            <TableHead>LinkedIn</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Reasoning</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                {isEditing ? (
                  <Input
                    value={row.name}
                    placeholder="Name"
                    onChange={(event) =>
                      updateField(row.id, "name", event.target.value)
                    }
                  />
                ) : (
                  row.name || "--"
                )}
              </TableCell>
              <TableCell>
                {isEditing ? (
                  <Input
                    value={row.company}
                    placeholder="Company"
                    onChange={(event) =>
                      updateField(row.id, "company", event.target.value)
                    }
                  />
                ) : (
                  row.company || "--"
                )}
              </TableCell>
              <TableCell>
                {isEditing ? (
                  <Input
                    type="email"
                    value={row.email}
                    placeholder="name@company.com"
                    onChange={(event) =>
                      updateField(row.id, "email", event.target.value)
                    }
                  />
                ) : row.email ? (
                  <a
                    href={`mailto:${row.email}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {row.email}
                  </a>
                ) : (
                  "--"
                )}
              </TableCell>
              <TableCell>
                {isEditing ? (
                  <Input
                    value={row.headline}
                    placeholder="Headline"
                    onChange={(event) =>
                      updateField(row.id, "headline", event.target.value)
                    }
                  />
                ) : (
                  <TruncatedTextModal
                    text={row.headline}
                    fallback="--"
                    modalTitle="Headline"
                    modalDescription={row.name || "Contact"}
                    previewLength={90}
                    previewClassName="line-clamp-2 block max-w-[260px] overflow-hidden text-sm leading-5 wrap-break-word"
                  />
                )}
              </TableCell>
              <TableCell>
                {isEditing ? (
                  <Input
                    value={row.linkedinUrl}
                    placeholder="https://linkedin.com/in/..."
                    onChange={(event) =>
                      updateField(row.id, "linkedinUrl", event.target.value)
                    }
                  />
                ) : row.linkedinUrl ? (
                  <a
                    href={toExternalUrl(row.linkedinUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open LinkedIn profile for ${row.name || "contact"}`}
                    title={row.linkedinUrl}
                    className="inline-flex items-center justify-center rounded-md p-1 text-primary hover:bg-muted"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                ) : (
                  "--"
                )}
              </TableCell>
              <TableCell>
                {isEditing ? (
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={
                      typeof row.score === "number" ? String(row.score) : ""
                    }
                    placeholder="0-100"
                    onChange={(event) => {
                      const next = event.target.value.trim();
                      if (!next) {
                        updateField(row.id, "score", null);
                        return;
                      }
                      const parsed = Number(next);
                      if (Number.isFinite(parsed)) {
                        const clamped = Math.min(
                          100,
                          Math.max(0, Math.round(parsed)),
                        );
                        updateField(row.id, "score", clamped);
                      }
                    }}
                  />
                ) : typeof row.score === "number" ? (
                  row.score
                ) : (
                  "--"
                )}
              </TableCell>
              <TableCell>
                {isEditing ? (
                  <Select
                    value={row.tier ?? undefined}
                    onValueChange={(value) => {
                      updateField(row.id, "tier", value);
                    }}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIER_OPTIONS.map((tier) => (
                        <SelectItem key={tier} value={tier}>
                          {tier.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : row.tier ? (
                  <Badge variant="secondary" className="uppercase">
                    {row.tier}
                  </Badge>
                ) : (
                  "--"
                )}
              </TableCell>
              <TableCell className="max-w-[260px] align-top">
                {isEditing ? (
                  <Textarea
                    value={row.reasoning ?? ""}
                    placeholder="Reasoning"
                    rows={4}
                    onChange={(event) =>
                      updateField(row.id, "reasoning", event.target.value)
                    }
                  />
                ) : (
                  <TruncatedTextModal
                    text={row.reasoning}
                    fallback="No reasoning available"
                    modalTitle="Reasoning"
                    modalDescription={row.name || "Contact"}
                    previewLength={180}
                    previewClassName="line-clamp-4 block max-w-[240px] overflow-hidden text-sm leading-5 wrap-break-word"
                  />
                )}
              </TableCell>
              <TableCell className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  {isEditing ? statusLabel(row.id) : ""}
                </div>
                {isEditing && statusById[row.id] === "error" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-destructive">
                      {errorById[row.id] ?? "Save failed"}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void saveRow(row.id)}
                    >
                      Retry
                    </Button>
                  </div>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
