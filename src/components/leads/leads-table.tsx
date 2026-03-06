 "use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScoreBadge } from "@/components/leads/score-badge";
import { StatusBadge } from "@/components/leads/status-badge";

export interface LeadRow {
  id: string;
  detailId: string;
  contactId: string | null;
  company: string;
  source: string;
  status: string;
  contactName: string | null;
  score: number | null;
  tier: string | null;
}

type LeadsTableProps = {
  rows: LeadRow[];
  /** When set, show checkboxes and use this controlled selection. */
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
};

export function LeadsTable({
  rows,
  selectedIds = new Set(),
  onSelectionChange,
}: LeadsTableProps) {
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
          <TableHead>Company</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Contact</TableHead>
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
                  aria-label={`Select ${row.company}`}
                />
              </TableCell>
            ) : null}
            <TableCell>{row.company}</TableCell>
            <TableCell>
              <Badge variant="outline" className="uppercase">
                {row.source}
              </Badge>
            </TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
            <TableCell>{row.contactName ?? "--"}</TableCell>
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
