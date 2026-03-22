import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IcpForm } from "@/components/campaigns/icp-form";
import { MailboxMultiSelect } from "@/components/campaigns/mailbox-multi-select";
import { ScoringForm } from "@/components/campaigns/scoring-form";
import { SequenceBuilder } from "@/components/campaigns/sequence-builder";
import { WorkflowBuilder } from "@/components/campaigns/workflow-builder";
import { leadTargetSchema } from "@/lib/campaigns/validation";
import { sequenceStepsArraySchema } from "@/lib/workflows/sequence-schema";
import { env } from "@/lib/config/env";
import { supabaseServer } from "@/lib/supabase/server";
import { requireCurrentUserCompany } from "@/lib/auth/user-company";

type SearchParams = Record<string, string | string[] | undefined>;
type MailboxMode = "least_loaded" | "round_robin" | "explicit_single";

function isPlaceholder(value: string): boolean {
  return (
    !value ||
    value.includes("xxxx.supabase.co") ||
    value.includes("eyJ...") ||
    value.includes("replace-with")
  );
}

function readParam(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function readIntParam(
  value: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number.parseInt(readParam(value, String(fallback)), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function createCampaign(formData: FormData) {
  "use server";
  const { companyId } = await requireCurrentUserCompany();

  const name = String(formData.get("name") ?? "");
  const icp_description = String(formData.get("icp_description") ?? "");
  const scoring_rubric = String(formData.get("scoring_rubric") ?? "");
  const hot_threshold = Number(formData.get("hot_threshold") ?? 75);
  const warm_threshold = Number(formData.get("warm_threshold") ?? 50);
  const value_prop = String(formData.get("value_prop") ?? "");
  const daily_send_limit = Number(formData.get("daily_send_limit") ?? 50);
  const leads_per_run = leadTargetSchema.parse(formData.get("lead_target") ?? 20);
  const mailbox_selection_mode = String(formData.get("mailbox_selection_mode") ?? "least_loaded");
  const primaryAccountIdRaw = String(formData.get("primary_account_id") ?? "");
  const primary_account_id = primaryAccountIdRaw.trim() || null;
  const templateExperimentIdRaw = String(formData.get("template_experiment_id") ?? "");
  const template_experiment_id = templateExperimentIdRaw.trim() || null;
  const account_ids = formData.getAll("account_ids").map(String);

  // Parse sequence steps
  const sequenceStepsRaw = String(formData.get("sequence_steps") ?? "[]");
  let sequence_steps;
  try {
    sequence_steps = sequenceStepsArraySchema.parse(JSON.parse(sequenceStepsRaw));
  } catch {
    throw new Error("Invalid sequence steps configuration");
  }

  // Parse send window
  const send_window_start = String(formData.get("send_window_start") ?? "09:00");
  const send_window_end = String(formData.get("send_window_end") ?? "17:00");
  const send_window_timezone = String(formData.get("send_window_timezone") ?? "America/New_York");
  let send_window_days: number[];
  try {
    send_window_days = JSON.parse(String(formData.get("send_window_days") ?? "[1,2,3,4,5]"));
  } catch {
    send_window_days = [1, 2, 3, 4, 5];
  }

  if (!["explicit_single", "round_robin", "least_loaded"].includes(mailbox_selection_mode)) {
    throw new Error("Invalid mailbox selection mode");
  }
  if (mailbox_selection_mode === "explicit_single" && !primary_account_id) {
    throw new Error("Primary mailbox is required when mailbox mode is explicit single");
  }

  if (
    isPlaceholder(env.NEXT_PUBLIC_SUPABASE_URL) ||
    isPlaceholder(env.SUPABASE_SERVICE_ROLE_KEY)
  ) {
    throw new Error(
      "Supabase is not configured. Set valid NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local/.env, then restart `npm run dev`.",
    );
  }

  try {
    const { data, error } = await supabaseServer
      .from("campaigns")
      .insert({
        company_id: companyId,
        name,
        icp_description,
        scoring_rubric,
        hot_threshold,
        warm_threshold,
        value_prop,
        daily_send_limit,
        leads_per_run,
        mailbox_selection_mode,
        primary_account_id,
        template_experiment_id,
        account_ids,
        sequence_steps,
        send_window_start,
        send_window_end,
        send_window_timezone,
        send_window_days,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    redirect(`/campaigns/${data.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("fetch failed")) {
      throw new Error(
        "Could not connect to Supabase. Verify SUPABASE URL/key values in env files and internet access, then restart the dev server.",
      );
    }
    throw error;
  }
}

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const mailboxModeRaw = readParam(params.mailbox_selection_mode, "");
  const mailboxSelectionMode: MailboxMode | undefined =
    mailboxModeRaw === "explicit_single" || mailboxModeRaw === "round_robin" || mailboxModeRaw === "least_loaded"
      ? mailboxModeRaw
      : undefined;

  const defaults = {
    name: readParam(params.name),
    icpDescription: readParam(params.icp_description),
    scoringRubric: readParam(params.scoring_rubric),
    hotThreshold: readIntParam(params.hot_threshold, 75, 1, 100),
    warmThreshold: readIntParam(params.warm_threshold, 50, 1, 100),
    valueProp: readParam(params.value_prop),
    dailySendLimit: readIntParam(params.daily_send_limit, 50, 1, 1000),
    leadTarget: readIntParam(params.lead_target, 20, 1, 100),
    mailboxSelectionMode,
    primaryAccountId: readParam(params.primary_account_id),
    templateExperimentId: readParam(params.template_experiment_id),
  };
  const { supabase, companyId } = await requireCurrentUserCompany();

  const [{ data: accounts }, { data: experiments }, { data: emailTemplates }] = await Promise.all([
    supabase
      .from("email_accounts")
      .select("id,gmail_address,is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .eq("connection_status", "connected")
      .order("created_at", { ascending: false }),
    supabase
      .from("email_template_experiments")
      .select("id,campaign_id,template_id,status")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("email_templates")
      .select("id,name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("updated_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Create Campaign</h1>
      <form action={createCampaign} className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="name">
            Campaign Name
          </label>
          <Input id="name" name="name" required defaultValue={defaults.name} />
        </div>
        <IcpForm defaultValue={defaults.icpDescription} />
        <ScoringForm
          defaults={{
            scoringRubric: defaults.scoringRubric,
            hotThreshold: defaults.hotThreshold,
            warmThreshold: defaults.warmThreshold,
          }}
        />
        <SequenceBuilder
          mailboxes={accounts ?? []}
          experiments={experiments ?? []}
          defaults={{
            valueProp: defaults.valueProp,
            dailySendLimit: defaults.dailySendLimit,
            leadTarget: defaults.leadTarget,
            mailboxSelectionMode: defaults.mailboxSelectionMode,
            primaryAccountId: defaults.primaryAccountId,
            templateExperimentId: defaults.templateExperimentId,
          }}
        />
        <WorkflowBuilder
          templates={(emailTemplates ?? []).map((t) => ({
            id: t.id as string,
            name: t.name as string,
          }))}
        />
        <div className="space-y-2">
          <p className="text-sm font-medium">Assigned Mailboxes</p>
          <p className="text-xs text-muted-foreground">
            These mailbox IDs are saved on the campaign and used by the email stage.
          </p>
          {(accounts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No active mailboxes found. Add one in settings first.</p>
          ) : (
            <MailboxMultiSelect
              accounts={(accounts ?? []).map((account) => ({
                id: account.id,
                gmail_address: account.gmail_address,
              }))}
            />
          )}
        </div>
        <Button type="submit">Create Campaign</Button>
      </form>
    </div>
  );
}
