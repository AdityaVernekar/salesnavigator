import { describe, it, expect } from "vitest";
import {
  sequenceStepSchema,
  sequenceStepsArraySchema,
  sendWindowSchema,
} from "../sequence-schema";

// ── sequenceStepSchema ─────────────────────────────────────────────

describe("sequenceStepSchema", () => {
  it("parses a valid minimal step with defaults", () => {
    const result = sequenceStepSchema.parse({ step_number: 0 });
    expect(result).toEqual({
      step_number: 0,
      delay_days: 0,
      delay_hours: 0,
      step_type: "email",
      template_id: null,
      subject_override: null,
      body_override: null,
    });
  });

  it("parses a fully specified step", () => {
    const input = {
      step_number: 2,
      delay_days: 3,
      delay_hours: 12,
      step_type: "email" as const,
      template_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      subject_override: "Follow up",
      body_override: "<p>Hi</p>",
    };
    expect(sequenceStepSchema.parse(input)).toEqual(input);
  });

  it("rejects negative step_number", () => {
    expect(() => sequenceStepSchema.parse({ step_number: -1 })).toThrow();
  });

  it("rejects non-integer step_number", () => {
    expect(() => sequenceStepSchema.parse({ step_number: 1.5 })).toThrow();
  });

  it("rejects delay_hours > 23", () => {
    expect(() =>
      sequenceStepSchema.parse({ step_number: 0, delay_hours: 24 }),
    ).toThrow();
  });

  it("rejects negative delay_days", () => {
    expect(() =>
      sequenceStepSchema.parse({ step_number: 0, delay_days: -1 }),
    ).toThrow();
  });

  it("rejects invalid template_id format", () => {
    expect(() =>
      sequenceStepSchema.parse({ step_number: 0, template_id: "not-a-uuid" }),
    ).toThrow();
  });

  it("accepts null template_id", () => {
    const result = sequenceStepSchema.parse({
      step_number: 0,
      template_id: null,
    });
    expect(result.template_id).toBeNull();
  });
});

// ── sequenceStepsArraySchema ───────────────────────────────────────

describe("sequenceStepsArraySchema", () => {
  it("accepts array with one valid step", () => {
    const result = sequenceStepsArraySchema.parse([{ step_number: 0 }]);
    expect(result).toHaveLength(1);
  });

  it("accepts array with multiple steps", () => {
    const result = sequenceStepsArraySchema.parse([
      { step_number: 0 },
      { step_number: 1, delay_days: 2 },
      { step_number: 2, delay_days: 5 },
    ]);
    expect(result).toHaveLength(3);
  });

  it("rejects empty array", () => {
    expect(() => sequenceStepsArraySchema.parse([])).toThrow(
      /at least one sequence step/i,
    );
  });
});

// ── sendWindowSchema ───────────────────────────────────────────────

describe("sendWindowSchema", () => {
  it("applies correct defaults", () => {
    const result = sendWindowSchema.parse({});
    expect(result).toEqual({
      send_window_start: "09:00",
      send_window_end: "17:00",
      send_window_timezone: "America/New_York",
      send_window_days: [1, 2, 3, 4, 5],
    });
  });

  it("accepts custom valid values", () => {
    const input = {
      send_window_start: "08:30",
      send_window_end: "18:00",
      send_window_timezone: "Europe/London",
      send_window_days: [1, 2, 3, 4, 5, 6],
    };
    expect(sendWindowSchema.parse(input)).toEqual(input);
  });

  it("rejects bad time format — single digit hour", () => {
    expect(() =>
      sendWindowSchema.parse({ send_window_start: "9:00" }),
    ).toThrow(/HH:MM/);
  });

  it("rejects bad time format — no colon", () => {
    expect(() =>
      sendWindowSchema.parse({ send_window_start: "0900" }),
    ).toThrow(/HH:MM/);
  });

  it("rejects day value 0", () => {
    expect(() =>
      sendWindowSchema.parse({ send_window_days: [0, 1, 2] }),
    ).toThrow();
  });

  it("rejects day value 8", () => {
    expect(() =>
      sendWindowSchema.parse({ send_window_days: [1, 8] }),
    ).toThrow();
  });

  it("rejects empty days array", () => {
    expect(() => sendWindowSchema.parse({ send_window_days: [] })).toThrow(
      /at least one send day/i,
    );
  });
});
