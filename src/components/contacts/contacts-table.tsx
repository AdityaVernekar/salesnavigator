"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScoreBadge } from "@/components/leads/score-badge";
import { StatusBadge } from "@/components/leads/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ContactRow {
  id: string;
  detailId: string;
  name: string | null;
  company: string | null;
  email: string | null;
  linkedinUrl: string | null;
  source: string | null;
  status: string | null;
  score: number | null;
  tier: string | null;
}

type ContactsTableProps = {
  rows: ContactRow[];
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
};

function toExternalUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function ContactsTable({
  rows,
  selectedIds = new Set(),
  onSelectionChange,
}: ContactsTableProps) {
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someSelected = rows.some((r) => selectedIds.has(r.id));

  const toggleRow = (id: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allOnPageSelected) {
      const next = new Set(selectedIds);
      rows.forEach((r) => next.delete(r.id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      rows.forEach((r) => next.add(r.id));
      onSelectionChange(next);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {onSelectionChange ? (
            <TableHead className="w-10">
              <Checkbox
                checked={allOnPageSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                aria-label="Select all on page"
              />
            </TableHead>
          ) : null}
          <TableHead>Name</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>LinkedIn</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Tier</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            {onSelectionChange ? (
              <TableCell className="w-10">
                <Checkbox
                  checked={selectedIds.has(row.id)}
                  onCheckedChange={() => toggleRow(row.id)}
                  aria-label={`Select ${row.name ?? row.company ?? "contact"}`}
                />
              </TableCell>
            ) : null}
            <TableCell>{row.name ?? "--"}</TableCell>
            <TableCell>{row.company ?? "--"}</TableCell>
            <TableCell>
              {row.email ? (
                <a
                  href={`mailto:${row.email}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {row.email}
                </a>
              ) : (
                <span className="text-muted-foreground">--</span>
              )}
            </TableCell>
            <TableCell>
              {row.linkedinUrl ? (
                <a
                  href={toExternalUrl(row.linkedinUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  LinkedIn
                </a>
              ) : (
                <span className="text-muted-foreground">--</span>
              )}
            </TableCell>
            <TableCell>
              {row.source ? (
                <Badge variant="outline" className="uppercase">
                  {row.source}
                </Badge>
              ) : (
                <span className="text-muted-foreground">--</span>
              )}
            </TableCell>
            <TableCell>
              {row.status ? <StatusBadge status={row.status} /> : <span className="text-muted-foreground">--</span>}
            </TableCell>
            <TableCell>
              {typeof row.score === "number" ? <ScoreBadge score={row.score} /> : <span className="text-muted-foreground">--</span>}
            </TableCell>
            <TableCell>
              {row.tier ? (
                <Badge variant="secondary" className="uppercase">
                  {row.tier}
                </Badge>
              ) : (
                <span className="text-muted-foreground">--</span>
              )}
            </TableCell>
            <TableCell>
              <Link href={`/leads/${row.detailId}`} className="text-sm text-primary underline">
                View
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
