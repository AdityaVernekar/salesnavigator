import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

const schema = z.object({
  accountIds: z.array(z.string().uuid()),
  mailboxSelectionMode: z.enum(["explicit_single", "round_robin", "least_loaded"]).default("least_loaded"),
  primaryAccountId: z.string().uuid().nullable().optional(),
  templateExperimentId: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { accountIds, mailboxSelectionMode, primaryAccountId, templateExperimentId } = schema.parse(await request.json());
    if (mailboxSelectionMode === "explicit_single" && !primaryAccountId) {
      throw new Error("Primary mailbox is required for explicit single mode");
    }
    if (primaryAccountId && !accountIds.includes(primaryAccountId)) {
      throw new Error("Primary mailbox must be included in assigned accountIds");
    }

    const { data, error } = await supabaseServer
      .from("campaigns")
      .update({
        account_ids: accountIds,
        mailbox_selection_mode: mailboxSelectionMode,
        primary_account_id: primaryAccountId ?? null,
        template_experiment_id: templateExperimentId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,account_ids,mailbox_selection_mode,primary_account_id,template_experiment_id")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, campaign: data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to update campaign mailboxes",
      },
      { status: 400 },
    );
  }
}
