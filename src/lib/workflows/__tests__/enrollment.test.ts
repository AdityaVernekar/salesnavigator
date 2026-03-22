import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEnrollmentWithSchedule } from "../enrollment";
import type { SequenceStep, SendWindowConfig } from "../sequence-schema";

// ── Mock Supabase client ───────────────────────────────────────────

function createMockSupabase(
  returnData: unknown = { id: "enr-001" },
  returnError: unknown = null,
) {
  const single = vi.fn().mockResolvedValue({ data: returnData, error: returnError });
  const select = vi.fn().mockReturnValue({ single });
  const upsert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ upsert });

  return {
    client: { from } as unknown as Parameters<typeof createEnrollmentWithSchedule>[0],
    spies: { from, upsert, select, single },
  };
}

function makeStep(overrides: Partial<SequenceStep> = {}): SequenceStep {
  return {
    step_number: 0,
    delay_days: 0,
    delay_hours: 0,
    step_type: "email",
    template_id: null,
    subject_override: null,
    body_override: null,
    ...overrides,
  };
}

const defaultWindow: SendWindowConfig = {
  send_window_start: "09:00",
  send_window_end: "17:00",
  send_window_timezone: "America/New_York",
  send_window_days: [1, 2, 3, 4, 5],
};

const baseParams = {
  campaignId: "camp-1",
  contactId: "contact-1",
  accountId: "acc-1",
  companyId: "comp-1",
  sendWindow: defaultWindow,
  contactTimezone: "America/New_York" as string | null,
};

// ── Tests ──────────────────────────────────────────────────────────

describe("createEnrollmentWithSchedule", () => {
  it("upserts to the enrollments table with correct fields", async () => {
    const { client, spies } = createMockSupabase();

    await createEnrollmentWithSchedule(client, {
      ...baseParams,
      sequenceSteps: [makeStep()],
    });

    expect(spies.from).toHaveBeenCalledWith("enrollments");
    expect(spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign_id: "camp-1",
        contact_id: "contact-1",
        account_id: "acc-1",
        company_id: "comp-1",
        current_step: 0,
        status: "active",
      }),
      { onConflict: "campaign_id,contact_id" },
    );
    expect(spies.select).toHaveBeenCalledWith("id");
    expect(spies.single).toHaveBeenCalled();
  });

  it("includes next_step_at and scheduled_send_at as ISO strings", async () => {
    const { client, spies } = createMockSupabase();

    await createEnrollmentWithSchedule(client, {
      ...baseParams,
      sequenceSteps: [makeStep({ delay_days: 2 })],
    });

    const upsertData = spies.upsert.mock.calls[0][0];
    expect(typeof upsertData.next_step_at).toBe("string");
    expect(typeof upsertData.scheduled_send_at).toBe("string");
    expect(typeof upsertData.enrolled_at).toBe("string");

    // next_step_at should be ~2 days from now
    const nextStep = new Date(upsertData.next_step_at);
    const enrolled = new Date(upsertData.enrolled_at);
    const diffHours =
      (nextStep.getTime() - enrolled.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(48, 0);
  });

  it("returns the data from supabase", async () => {
    const { client } = createMockSupabase({ id: "enr-999" });

    const result = await createEnrollmentWithSchedule(client, {
      ...baseParams,
      sequenceSteps: [makeStep()],
    });

    expect(result).toEqual({ id: "enr-999" });
  });

  it("throws when sequence steps is empty", async () => {
    const { client } = createMockSupabase();

    await expect(
      createEnrollmentWithSchedule(client, {
        ...baseParams,
        sequenceSteps: [],
      }),
    ).rejects.toThrow(/no sequence steps/i);
  });

  it("throws and surfaces supabase error message", async () => {
    const { client } = createMockSupabase(null, {
      message: "unique constraint violated",
    });

    await expect(
      createEnrollmentWithSchedule(client, {
        ...baseParams,
        sequenceSteps: [makeStep()],
      }),
    ).rejects.toThrow(/unique constraint violated/);
  });
});
