"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClassificationBadge } from "@/components/inbox/classification-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTimeUtc } from "@/lib/date-format";

type LeadEmailActivityItem = {
  id: string;
  contactId: string | null;
  contactName: string;
  contactEmail: string;
  companyName: string;
  enrollmentId: string | null;
  enrollmentStatus: string;
  enrollmentStep: number | null;
  nextStepAt: string | null;
  accountId: string | null;
  accountAddress: string;
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
  templateVersionId: string | null;
  isTestSend: boolean;
  renderMode: string;
};

type LeadTemplateOption = {
  id: string;
  name: string;
  versionId: string;
  version: number;
  subjectTemplate: string;
  bodyTemplate: string;
};

type LeadMailboxOption = {
  id: string;
  gmailAddress: string;
};

type LeadContactOption = {
  id: string;
  name: string;
  email: string;
  companyName: string;
  headline: string;
};

type LeadEmailActivityProps = {
  leadId: string;
  activity: LeadEmailActivityItem[];
  contacts: LeadContactOption[];
  templates: LeadTemplateOption[];
  mailboxes: LeadMailboxOption[];
};

function truncate(value: string, max = 120) {
  if (!value) return "";
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

function renderWithVariables(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => variables[key] ?? "");
}

function buildTemplateVariables(contact: LeadContactOption) {
  const fallbackName = contact.name || contact.email;
  const firstName = fallbackName.split(" ")[0] ?? fallbackName;
  return {
    first_name: firstName,
    name: contact.name,
    company_name: contact.companyName,
    headline: contact.headline,
    email: contact.email,
    recommended_angle: "",
    value_prop: "",
  };
}

export function LeadEmailActivity({
  leadId,
  activity,
  contacts,
  templates,
  mailboxes,
}: LeadEmailActivityProps) {
  const router = useRouter();
  const [isSyncing, startSync] = useTransition();
  const [isSending, startSend] = useTransition();
  const [isDrafting, startDraft] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"send" | "followup">("send");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [accountId, setAccountId] = useState(mailboxes[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("__none");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [draftingForEmailId, setDraftingForEmailId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const contactById = useMemo(() => new Map(contacts.map((item) => [item.id, item])), [contacts]);
  const templateById = useMemo(() => new Map(templates.map((item) => [item.id, item])), [templates]);

  const resetComposer = (mode: "send" | "followup") => {
    setDialogMode(mode);
    setDraftingForEmailId(null);
    setTemplateId("__none");
    setSubject("");
    setBodyHtml("");
    setError(null);
    if (contacts[0]?.id) setContactId(contacts[0].id);
    if (mailboxes[0]?.id) setAccountId(mailboxes[0].id);
  };

  const applyTemplate = (nextTemplateId: string, nextContactId = contactId) => {
    setTemplateId(nextTemplateId);
    if (nextTemplateId === "__none") return;
    const template = templateById.get(nextTemplateId);
    const contact = contactById.get(nextContactId);
    if (!template || !contact) return;
    const variables = buildTemplateVariables(contact);
    setSubject(renderWithVariables(template.subjectTemplate, variables).trim());
    setBodyHtml(renderWithVariables(template.bodyTemplate, variables).trim());
  };

  const openSendDialog = () => {
    resetComposer("send");
    setDialogOpen(true);
  };

  const openFollowUpDialog = (item: LeadEmailActivityItem) => {
    resetComposer("followup");
    if (item.contactId) setContactId(item.contactId);
    if (item.accountId) setAccountId(item.accountId);
    setDialogOpen(true);
    setDraftingForEmailId(item.id);
    startDraft(async () => {
      setError(null);
      setFeedback(null);
      try {
        const response = await fetch(`/api/leads/${leadId}/follow-up-draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emailId: item.id }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          draft?: { subject?: string; bodyHtml?: string };
          contactId?: string;
          accountId?: string | null;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Failed to generate follow-up draft.");
        }
        if (payload.contactId) setContactId(payload.contactId);
        if (payload.accountId) setAccountId(payload.accountId);
        setSubject(payload.draft?.subject ?? "");
        setBodyHtml(payload.draft?.bodyHtml ?? "");
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to generate follow-up draft.",
        );
      } finally {
        setDraftingForEmailId(null);
      }
    });
  };

  const onSyncReplies = () => {
    startSync(async () => {
      setError(null);
      const response = await fetch("/api/inbox", { method: "POST" });
      if (!response.ok) {
        setError("Failed to sync replies.");
        return;
      }
      setFeedback("Replies synced.");
      router.refresh();
    });
  };

  const onSend = () => {
    startSend(async () => {
      setError(null);
      setFeedback(null);
      try {
        if (!contactId) throw new Error("Select a contact before sending.");
        if (!accountId) throw new Error("Select a mailbox before sending.");
        if (!subject.trim()) throw new Error("Subject is required.");
        if (!bodyHtml.trim()) throw new Error("Email body is required.");

        const templateVersionId = templateId !== "__none" ? templateById.get(templateId)?.versionId ?? null : null;
        const response = await fetch(`/api/leads/${leadId}/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId,
            accountId,
            subject: subject.trim(),
            bodyHtml: bodyHtml.trim(),
            templateVersionId,
          }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Failed to send email.");
        }
        setDialogOpen(false);
        setFeedback("Email sent successfully.");
        router.refresh();
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : "Failed to send email.",
        );
      }
    });
  };

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Email Activity</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={openSendDialog} disabled={!contacts.length || !mailboxes.length}>
            Send an email
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSyncReplies}
            disabled={isSyncing}
          >
            {isSyncing ? "Syncing..." : "Sync replies"}
          </Button>
        </div>
        {!contacts.length ? (
          <p className="text-xs text-muted-foreground">No contacts with email found yet.</p>
        ) : null}
        {!mailboxes.length ? (
          <p className="text-xs text-muted-foreground">Connect at least one mailbox to send emails.</p>
        ) : null}
        {feedback ? <p className="text-xs text-emerald-600">{feedback}</p> : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {!activity.length ? (
          <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
            No email activity for this lead yet.
          </div>
        ) : (
          activity.map((item) => (
            <div key={item.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium">{item.subject || "(No subject)"}</div>
                <ClassificationBadge value={item.classification || "UNCLASSIFIED"} />
                {item.isTestSend ? <Badge variant="outline">test send</Badge> : null}
                <Badge variant="outline">{item.enrollmentStatus}</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                to: {item.toEmail || item.originalToEmail || "-"} | sent: {formatDateTimeUtc(item.sentAt)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                contact: {item.contactName || "-"} ({item.contactEmail || "-"}) {item.accountAddress ? `| mailbox: ${item.accountAddress}` : ""}
              </div>
              {item.replySnippet ? (
                <div className="mt-2 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                  reply: {truncate(item.replySnippet)}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={() => openFollowUpDialog(item)}
                  disabled={isDrafting && draftingForEmailId === item.id}
                >
                  {isDrafting && draftingForEmailId === item.id ? "Writing follow-up..." : "Follow up"}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogMode === "followup" ? "Follow-up draft" : "Send an email"}</DialogTitle>
            <DialogDescription>
              Select a contact, template, and mailbox. You can edit everything before sending.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-1">
            <div className="grid gap-2">
              <Label htmlFor="lead-email-contact">Contact</Label>
              <Select
                value={contactId || "__none"}
                onValueChange={(value) => setContactId(value === "__none" ? "" : value)}
              >
                <SelectTrigger id="lead-email-contact" className="w-full">
                  <SelectValue placeholder="Select contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select contact</SelectItem>
                  {contacts.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name || item.email} ({item.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lead-email-template">Template</Label>
              <Select value={templateId} onValueChange={(value) => applyTemplate(value)}>
                <SelectTrigger id="lead-email-template" className="w-full">
                  <SelectValue placeholder="No template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No template</SelectItem>
                  {templates.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} (v{item.version})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lead-email-mailbox">Mailbox</Label>
              <Select
                value={accountId || "__none"}
                onValueChange={(value) => setAccountId(value === "__none" ? "" : value)}
              >
                <SelectTrigger id="lead-email-mailbox" className="w-full">
                  <SelectValue placeholder="Select mailbox" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select mailbox</SelectItem>
                  {mailboxes.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.gmailAddress}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lead-email-subject">Subject</Label>
              <Input
                id="lead-email-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lead-email-body">Body</Label>
              <Textarea
                id="lead-email-body"
                value={bodyHtml}
                onChange={(event) => setBodyHtml(event.target.value)}
                className="min-h-40"
                placeholder="Email body (HTML or plain text)"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isSending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSend}
              disabled={isSending || isDrafting || !contacts.length || !mailboxes.length}
            >
              {isSending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
