"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type MailboxOption = {
  id: string;
  gmail_address: string;
};

type ExperimentOption = {
  id: string;
  campaign_id: string;
  template_id: string;
  status: string;
};

type SequenceBuilderDefaults = {
  valueProp?: string;
  dailySendLimit?: number;
  leadTarget?: number;
  mailboxSelectionMode?: "least_loaded" | "round_robin" | "explicit_single";
  primaryAccountId?: string;
  templateExperimentId?: string;
};

export function SequenceBuilder({
  mailboxes,
  experiments,
  defaults,
}: {
  mailboxes: MailboxOption[];
  experiments: ExperimentOption[];
  defaults?: SequenceBuilderDefaults;
}) {
  type MailboxMode = "least_loaded" | "round_robin" | "explicit_single";
  const [mailboxMode, setMailboxMode] = useState(defaults?.mailboxSelectionMode ?? "least_loaded");
  const [primaryAccountId, setPrimaryAccountId] = useState(defaults?.primaryAccountId ?? "");
  const [templateExperimentId, setTemplateExperimentId] = useState(defaults?.templateExperimentId ?? "");

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="value_prop">Value Proposition</Label>
        <Textarea
          id="value_prop"
          name="value_prop"
          placeholder="What value do we provide?"
          defaultValue={defaults?.valueProp}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="daily_send_limit">Daily Send Limit</Label>
        <Input
          id="daily_send_limit"
          name="daily_send_limit"
          type="number"
          defaultValue={defaults?.dailySendLimit ?? 50}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mailbox_selection_mode">Mailbox Selection Mode</Label>
        <Input type="hidden" id="mailbox_selection_mode" name="mailbox_selection_mode" value={mailboxMode} readOnly />
        <Select value={mailboxMode} onValueChange={(value) => setMailboxMode(value as MailboxMode)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="least_loaded">Least loaded</SelectItem>
            <SelectItem value="round_robin">Round robin</SelectItem>
            <SelectItem value="explicit_single">Explicit single mailbox</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="primary_account_id">Primary Mailbox (required for explicit single)</Label>
        <Input type="hidden" id="primary_account_id" name="primary_account_id" value={primaryAccountId} readOnly />
        <Select value={primaryAccountId || "__none"} onValueChange={(value) => setPrimaryAccountId(value === "__none" ? "" : value)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="None selected" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">None selected</SelectItem>
            {mailboxes.map((mailbox) => (
              <SelectItem key={mailbox.id} value={mailbox.id}>
                {mailbox.gmail_address}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="template_experiment_id">Template A/B Experiment (optional)</Label>
        <Input type="hidden" id="template_experiment_id" name="template_experiment_id" value={templateExperimentId} readOnly />
        <Select
          value={templateExperimentId || "__none"}
          onValueChange={(value) => setTemplateExperimentId(value === "__none" ? "" : value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="No experiment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No experiment</SelectItem>
            {experiments.map((experiment) => (
              <SelectItem key={experiment.id} value={experiment.id}>
                {experiment.id.slice(0, 8)} - {experiment.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="lead_target">Lead Target</Label>
        <Input
          id="lead_target"
          name="lead_target"
          type="number"
          min={1}
          max={100}
          defaultValue={defaults?.leadTarget ?? 20}
          required
        />
        <p className="text-xs text-muted-foreground">
          Cumulative campaign target. Reruns keep adding leads until this number is reached (max 100).
        </p>
      </div>
    </div>
  );
}
