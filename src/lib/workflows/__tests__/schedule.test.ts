import { describe, it, expect } from "vitest";
import {
  computeNextStepAt,
  applySchedulingWindow,
  isWithinSendWindow,
} from "../schedule";
import type { SendWindowConfig } from "../sequence-schema";
import type { SequenceStep } from "../sequence-schema";

function makeStep(overrides: Partial<SequenceStep> = {}): SequenceStep {
  return {
    step_number: 1,
    delay_days: 0,
    delay_hours: 0,
    step_type: "email",
    template_id: null,
    subject_override: null,
    body_override: null,
    ...overrides,
  };
}

function makeWindow(overrides: Partial<SendWindowConfig> = {}): SendWindowConfig {
  return {
    send_window_start: "09:00",
    send_window_end: "17:00",
    send_window_timezone: "America/New_York",
    send_window_days: [1, 2, 3, 4, 5],
    ...overrides,
  };
}

// ── computeNextStepAt ──────────────────────────────────────────────

describe("computeNextStepAt", () => {
  const base = new Date("2026-03-20T10:00:00Z");

  it("adds delay_days correctly", () => {
    const result = computeNextStepAt(base, makeStep({ delay_days: 2 }));
    expect(result.getTime()).toBe(base.getTime() + 2 * 24 * 60 * 60_000);
  });

  it("adds delay_hours correctly", () => {
    const result = computeNextStepAt(base, makeStep({ delay_hours: 3 }));
    expect(result.getTime()).toBe(base.getTime() + 3 * 60 * 60_000);
  });

  it("adds both delay_days and delay_hours", () => {
    const result = computeNextStepAt(
      base,
      makeStep({ delay_days: 1, delay_hours: 6 }),
    );
    expect(result.getTime()).toBe(base.getTime() + 30 * 60 * 60_000);
  });

  it("returns same timestamp when delay is zero", () => {
    const result = computeNextStepAt(base, makeStep());
    expect(result.getTime()).toBe(base.getTime());
  });

  it("handles large delays", () => {
    const result = computeNextStepAt(
      base,
      makeStep({ delay_days: 14, delay_hours: 23 }),
    );
    const expectedMs = (14 * 24 + 23) * 60 * 60_000;
    expect(result.getTime()).toBe(base.getTime() + expectedMs);
  });
});

// ── applySchedulingWindow ──────────────────────────────────────────

describe("applySchedulingWindow", () => {
  it("returns unchanged when already within window", () => {
    // Tuesday 2026-03-24 14:00 UTC = 10:00 ET (within 09:00-17:00)
    const rawTime = new Date("2026-03-24T14:00:00Z");
    const result = applySchedulingWindow(rawTime, makeWindow(), "America/New_York");
    expect(result.getTime()).toBe(rawTime.getTime());
  });

  it("bumps to window start when before start on allowed day", () => {
    // Tuesday 2026-03-24 11:00 UTC = 07:00 ET (before 09:00)
    const rawTime = new Date("2026-03-24T11:00:00Z");
    const result = applySchedulingWindow(rawTime, makeWindow(), "America/New_York");
    // Should bump to 09:00 ET = 13:00 UTC
    expect(result.getTime()).toBe(new Date("2026-03-24T13:00:00Z").getTime());
  });

  it("pushes to next day when after window end", () => {
    // Tuesday 2026-03-24 22:00 UTC = 18:00 ET (after 17:00)
    const rawTime = new Date("2026-03-24T22:00:00Z");
    const result = applySchedulingWindow(rawTime, makeWindow(), "America/New_York");
    // Should push to Wed 09:00 ET = Wed 13:00 UTC
    expect(result.getTime()).toBe(new Date("2026-03-25T13:00:00Z").getTime());
  });

  it("skips weekend to Monday", () => {
    // Saturday 2026-03-28 14:00 UTC = 10:00 ET
    const rawTime = new Date("2026-03-28T14:00:00Z");
    const result = applySchedulingWindow(rawTime, makeWindow(), "America/New_York");
    // Should push to Monday 2026-03-30 09:00 ET = 13:00 UTC
    expect(result.getTime()).toBe(new Date("2026-03-30T13:00:00Z").getTime());
  });

  it("skips Sunday to Monday", () => {
    // Sunday 2026-03-29 14:00 UTC = 10:00 ET
    const rawTime = new Date("2026-03-29T14:00:00Z");
    const result = applySchedulingWindow(rawTime, makeWindow(), "America/New_York");
    // Should push to Monday 2026-03-30 09:00 ET = 13:00 UTC
    expect(result.getTime()).toBe(new Date("2026-03-30T13:00:00Z").getTime());
  });

  it("uses send_window_timezone when contactTimezone is null", () => {
    // Tuesday 2026-03-24 11:00 UTC = 07:00 ET (before window)
    const rawTime = new Date("2026-03-24T11:00:00Z");
    const result = applySchedulingWindow(rawTime, makeWindow(), null);
    // Should use America/New_York from window config, bump to 09:00 ET = 13:00 UTC
    expect(result.getTime()).toBe(new Date("2026-03-24T13:00:00Z").getTime());
  });

  it("respects contact timezone over window timezone", () => {
    // Tuesday 2026-03-24 14:00 UTC
    // In America/New_York (UTC-4): 10:00 → within 09:00-17:00
    // In America/Los_Angeles (UTC-7): 07:00 → before 09:00
    const rawTime = new Date("2026-03-24T14:00:00Z");

    const resultET = applySchedulingWindow(rawTime, makeWindow(), "America/New_York");
    expect(resultET.getTime()).toBe(rawTime.getTime()); // within window

    const resultPT = applySchedulingWindow(rawTime, makeWindow(), "America/Los_Angeles");
    expect(resultPT.getTime()).toBeGreaterThan(rawTime.getTime()); // bumped forward
  });

  it("falls back to raw time when no valid slot within 14 days", () => {
    // No allowed days at all (empty-ish: only day 0 which doesn't exist)
    const rawTime = new Date("2026-03-24T14:00:00Z");
    const result = applySchedulingWindow(
      rawTime,
      makeWindow({ send_window_days: [] as unknown as number[] }),
      "UTC",
    );
    expect(result.getTime()).toBe(rawTime.getTime());
  });
});

// ── isWithinSendWindow ─────────────────────────────────────────────

describe("isWithinSendWindow", () => {
  const window = makeWindow();

  it("returns true when inside window on allowed day", () => {
    // Tuesday 2026-03-24 14:00 UTC = 10:00 ET
    const now = new Date("2026-03-24T14:00:00Z");
    expect(isWithinSendWindow(now, window, "America/New_York")).toBe(true);
  });

  it("returns false before window start on allowed day", () => {
    // Tuesday 2026-03-24 11:00 UTC = 07:00 ET
    const now = new Date("2026-03-24T11:00:00Z");
    expect(isWithinSendWindow(now, window, "America/New_York")).toBe(false);
  });

  it("returns false after window end on allowed day", () => {
    // Tuesday 2026-03-24 22:00 UTC = 18:00 ET
    const now = new Date("2026-03-24T22:00:00Z");
    expect(isWithinSendWindow(now, window, "America/New_York")).toBe(false);
  });

  it("returns false at exactly the end time (exclusive)", () => {
    // Tuesday 2026-03-24 21:00 UTC = 17:00 ET (exactly end)
    const now = new Date("2026-03-24T21:00:00Z");
    expect(isWithinSendWindow(now, window, "America/New_York")).toBe(false);
  });

  it("returns true at exactly the start time (inclusive)", () => {
    // Tuesday 2026-03-24 13:00 UTC = 09:00 ET (exactly start)
    const now = new Date("2026-03-24T13:00:00Z");
    expect(isWithinSendWindow(now, window, "America/New_York")).toBe(true);
  });

  it("returns false on disallowed day even within hours", () => {
    // Saturday 2026-03-28 14:00 UTC = 10:00 ET (within hours but Saturday)
    const now = new Date("2026-03-28T14:00:00Z");
    expect(isWithinSendWindow(now, window, "America/New_York")).toBe(false);
  });

  it("uses send_window_timezone when contact timezone is null", () => {
    // Tuesday 2026-03-24 14:00 UTC = 10:00 ET
    const now = new Date("2026-03-24T14:00:00Z");
    expect(isWithinSendWindow(now, window, null)).toBe(true);
  });
});
