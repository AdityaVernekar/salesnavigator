"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function ContactsEditableTable({
  contacts,
}: {
  contacts: EditableContactRow[];
}) {
  const [rows, setRows] = useState<EditableContactRow[]>(contacts);
  const [isEditing, setIsEditing] = useState(false);
  const [statusById, setStatusById] = useState<Record<string, SaveStatus>>({});
  const [errorById, setErrorById] = useState<Record<string, string | null>>({});
  const rowsRef = useRef(rows);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const versionRef = useRef<Record<string, number>>({});

  useEffect(() => {
    setRows(contacts);
  }, [contacts]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  async function saveRow(contactId: string) {
    const row = rowsRef.current.find((item) => item.id === contactId);
    if (!row) return;

    const currentVersion = (versionRef.current[contactId] ?? 0) + 1;
    versionRef.current[contactId] = currentVersion;
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
        };
      };

      if (!response.ok || !payload.ok || !payload.contact) {
        throw new Error(payload.error ?? "Failed to save contact");
      }

      if (versionRef.current[contactId] !== currentVersion) return;

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
              }
            : item,
        ),
      );
      setStatusById((prev) => ({ ...prev, [contactId]: "saved" }));

      setTimeout(() => {
        setStatusById((prev) =>
          prev[contactId] === "saved" ? { ...prev, [contactId]: "idle" } : prev,
        );
      }, 1200);
    } catch (error) {
      if (versionRef.current[contactId] !== currentVersion) return;
      setStatusById((prev) => ({ ...prev, [contactId]: "error" }));
      setErrorById((prev) => ({
        ...prev,
        [contactId]: error instanceof Error ? error.message : "Save failed",
      }));
    }
  }

  function queueSave(contactId: string) {
    if (timersRef.current[contactId]) {
      clearTimeout(timersRef.current[contactId]);
    }
    timersRef.current[contactId] = setTimeout(() => {
      void saveRow(contactId);
    }, 700);
  }

  function updateField(
    contactId: string,
    field: keyof EditableContactRow,
    value: string,
  ) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === contactId ? { ...row, [field]: value } : row,
      ),
    );
    queueSave(contactId);
  }

  function statusLabel(contactId: string) {
    const status = statusById[contactId] ?? "idle";
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

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant={isEditing ? "secondary" : "outline"}
          onClick={() => setIsEditing((prev) => !prev)}
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
                    onBlur={() => void saveRow(row.id)}
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
                    onBlur={() => void saveRow(row.id)}
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
                    onBlur={() => void saveRow(row.id)}
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
                    onBlur={() => void saveRow(row.id)}
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
                    onBlur={() => void saveRow(row.id)}
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
                {typeof row.score === "number" ? row.score : "--"}
              </TableCell>
              <TableCell>
                {row.tier ? (
                  <Badge variant="secondary" className="uppercase">
                    {row.tier}
                  </Badge>
                ) : (
                  "--"
                )}
              </TableCell>
              <TableCell className="max-w-[260px] align-top">
                <TruncatedTextModal
                  text={row.reasoning}
                  fallback="No reasoning available"
                  modalTitle="Reasoning"
                  modalDescription={row.name || "Contact"}
                  previewLength={180}
                  previewClassName="line-clamp-4 block max-w-[240px] overflow-hidden text-sm leading-5 wrap-break-word"
                />
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
