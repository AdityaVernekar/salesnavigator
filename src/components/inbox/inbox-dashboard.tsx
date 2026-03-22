"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ClassificationBadge } from "@/components/inbox/classification-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTimeUtc } from "@/lib/date-format";

type InboxItem = {
  id: string;
  campaignId: string | null;
  campaignName: string;
  contactId: string | null;
  contactName: string;
  contactEmail: string;
  companyName: string;
  enrollmentId: string | null;
  enrollmentStatus: string;
  threadId: string;
  toEmail: string;
  originalToEmail: string;
  subject: string;
  classification: string;
  sentAt: string;
  repliedAt: string | null;
  lastReplyAt: string | null;
  replyFromEmail: string | null;
  replySnippet: string | null;
  isTestSend: boolean;
  renderMode: string;
};

type CampaignOption = {
  id: string;
  name: string;
};

type InboxDashboardProps = {
  items: InboxItem[];
  campaigns: CampaignOption[];
  view: "sent" | "replies" | "needs_reply";
  campaignId: string;
  limit: number;
  cursor?: string;
  nextCursor: string | null;
};

function truncate(value: string, max = 70) {
  if (!value) return "";
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

export function InboxDashboard({
  items,
  campaigns,
  view,
  campaignId,
  limit,
  cursor,
  nextCursor,
}: InboxDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSyncing, startSync] = useTransition();
  const [isUpdatingClassification, startClassificationUpdate] = useTransition();

  const campaignOptions = useMemo(
    () => [{ id: "all", name: "All campaigns" }, ...campaigns],
    [campaigns],
  );

  const setParams = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("campaignId", campaignId);
    params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);

    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const copyText = async (value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
  };

  const onSync = () => {
    startSync(async () => {
      const response = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignId !== "all" ? { campaignId } : {}),
      });
      if (!response.ok) return;
      router.refresh();
    });
  };

  const updateClassification = (id: string, classification: string) => {
    startClassificationUpdate(async () => {
      await fetch(`/api/inbox/${id}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classification }),
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={view}
          onValueChange={(nextView) =>
            setParams({ view: nextView, cursor: null })
          }
        >
          <TabsList>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="replies">Replies</TabsTrigger>
            <TabsTrigger value="needs_reply">Needs Reply</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select
          value={campaignId}
          onValueChange={(nextCampaignId) =>
            setParams({ campaignId: nextCampaignId, cursor: null })
          }
        >
          <SelectTrigger className="min-w-[220px]">
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            {campaignOptions.map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={onSync} disabled={isSyncing}>
          {isSyncing ? "Syncing..." : "Sync Replies"}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Classification</TableHead>
            <TableHead>Timestamps</TableHead>
            <TableHead>IDs</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="align-top">
                <div className="font-medium">{item.subject || "(No subject)"}</div>
                <div className="text-xs text-muted-foreground">
                  to: {item.toEmail || item.originalToEmail || "-"}
                </div>
                {item.replySnippet ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    reply: {truncate(item.replySnippet, 120)}
                  </div>
                ) : null}
              </TableCell>
              <TableCell className="align-top">
                <div>{item.campaignName}</div>
                {item.isTestSend ? (
                  <div className="text-xs text-amber-600">test send</div>
                ) : null}
              </TableCell>
              <TableCell className="align-top">
                <div>{item.contactName || "-"}</div>
                <div className="text-xs text-muted-foreground">
                  {item.contactEmail || item.replyFromEmail || "-"}
                </div>
                {item.companyName ? (
                  <div className="text-xs text-muted-foreground">{item.companyName}</div>
                ) : null}
              </TableCell>
              <TableCell className="align-top">
                <div className="text-sm">{item.enrollmentStatus}</div>
                <div className="text-xs text-muted-foreground">{item.renderMode}</div>
              </TableCell>
              <TableCell className="align-top">
                <div className="mb-1">
                  <ClassificationBadge value={item.classification || "UNCLASSIFIED"} />
                </div>
                <Select
                  value={item.classification || "UNCLASSIFIED"}
                  onValueChange={(next) => updateClassification(item.id, next)}
                  disabled={isUpdatingClassification}
                >
                  <SelectTrigger size="sm" className="min-w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNCLASSIFIED">UNCLASSIFIED</SelectItem>
                    <SelectItem value="INTERESTED">INTERESTED</SelectItem>
                    <SelectItem value="NOT_INTERESTED">NOT_INTERESTED</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="align-top text-xs text-muted-foreground">
                <div>sent: {formatDateTimeUtc(item.sentAt)}</div>
                <div>replied: {formatDateTimeUtc(item.lastReplyAt ?? item.repliedAt)}</div>
              </TableCell>
              <TableCell className="align-top text-xs">
                <div className="space-y-1">
                  <button
                    className="underline underline-offset-2"
                    onClick={() => copyText(item.id)}
                    type="button"
                  >
                    copy email_id
                  </button>
                  {item.threadId ? (
                    <button
                      className="underline underline-offset-2"
                      onClick={() => copyText(item.threadId)}
                      type="button"
                    >
                      copy thread_id
                    </button>
                  ) : null}
                  {item.enrollmentId ? (
                    <button
                      className="underline underline-offset-2"
                      onClick={() => copyText(item.enrollmentId as string)}
                      type="button"
                    >
                      copy enrollment_id
                    </button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!items.length ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No records found for current filters.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      <div className="flex justify-end">
        <Button
          variant="outline"
          disabled={!nextCursor}
          onClick={() => {
            if (!nextCursor) return;
            setParams({ cursor: nextCursor });
          }}
        >
          {nextCursor ? "Load more" : "No more records"}
        </Button>
      </div>
    </div>
  );
}
