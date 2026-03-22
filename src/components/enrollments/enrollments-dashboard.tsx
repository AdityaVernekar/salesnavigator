"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EnrollmentItem = {
  id: string;
  campaignId: string;
  campaignName: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  companyName: string;
  currentStep: number;
  totalSteps: number;
  status: string;
  scheduledSendAt: string | null;
  enrolledAt: string;
  threadId: string | null;
};

type CampaignOption = {
  id: string;
  name: string;
};

const STATUS_OPTIONS = [
  "active",
  "paused",
  "replied",
  "completed",
  "unsubscribed",
] as const;

function statusVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  if (status === "active") return "default";
  if (status === "paused") return "secondary";
  if (status === "replied") return "outline";
  if (status === "unsubscribed") return "destructive";
  return "outline";
}

function relativeTime(isoDate: string | null): string {
  if (!isoDate) return "—";
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff < 0) return "overdue";
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}

export function EnrollmentsDashboard({
  items,
  campaigns,
  campaignId,
  status,
}: {
  items: EnrollmentItem[];
  campaigns: CampaignOption[];
  campaignId: string;
  status: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [isBulkAction, startBulkAction] = useTransition();

  const setParams = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    params.set("campaignId", campaignId);
    params.set("status", status);
    for (const [key, value] of Object.entries(patch)) {
      if (value === "all") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const enrollmentAction = async (
    enrollmentId: string,
    action: "pause" | "resume" | "unenroll",
  ) => {
    setActionInFlight(enrollmentId);
    try {
      await fetch(`/api/enrollments/${enrollmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      router.refresh();
    } finally {
      setActionInFlight(null);
    }
  };

  const bulkAction = (action: "pause" | "unenroll") => {
    if (campaignId === "all") return;
    startBulkAction(async () => {
      await fetch("/api/enrollments/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, campaignId }),
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={campaignId}
          onValueChange={(v) => setParams({ campaignId: v })}
        >
          <SelectTrigger className="min-w-[200px]">
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) => setParams({ status: v })}
        >
          <SelectTrigger className="min-w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {campaignId !== "all" && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={isBulkAction}
              onClick={() => bulkAction("pause")}
            >
              {isBulkAction ? "Working…" : "Pause All"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isBulkAction}
              onClick={() => bulkAction("unenroll")}
            >
              {isBulkAction ? "Working…" : "Unenroll All"}
            </Button>
          </>
        )}

        <span className="text-xs text-muted-foreground">
          {items.length} enrollments
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contact</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Step</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Next Send</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="align-top">
                <Link
                  href={`/leads/${item.contactId}`}
                  className="font-medium text-primary underline"
                >
                  {item.contactName || "Unknown"}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {item.contactEmail || "—"}
                </div>
                {item.companyName && (
                  <div className="text-xs text-muted-foreground">
                    {item.companyName}
                  </div>
                )}
              </TableCell>
              <TableCell className="align-top">
                <div>{item.campaignName}</div>
              </TableCell>
              <TableCell className="align-top">
                <span className="font-mono text-sm">
                  {item.currentStep} / {item.totalSteps || "?"}
                </span>
              </TableCell>
              <TableCell className="align-top">
                <Badge variant={statusVariant(item.status)}>
                  {item.status}
                </Badge>
              </TableCell>
              <TableCell className="align-top text-sm text-muted-foreground">
                {item.status === "active"
                  ? relativeTime(item.scheduledSendAt)
                  : "—"}
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-wrap gap-1">
                  {item.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={actionInFlight === item.id}
                      onClick={() => enrollmentAction(item.id, "pause")}
                    >
                      Pause
                    </Button>
                  )}
                  {item.status === "paused" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={actionInFlight === item.id}
                      onClick={() => enrollmentAction(item.id, "resume")}
                    >
                      Resume
                    </Button>
                  )}
                  {item.status === "replied" && item.threadId && (
                    <Link href={`/inbox?view=replies`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                      >
                        View Thread
                      </Button>
                    </Link>
                  )}
                  {!["completed", "unsubscribed", "bounced"].includes(
                    item.status,
                  ) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      disabled={actionInFlight === item.id}
                      onClick={() => enrollmentAction(item.id, "unenroll")}
                    >
                      Unenroll
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!items.length && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                No enrollments found for current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
