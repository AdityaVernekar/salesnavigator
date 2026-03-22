import { z } from "zod";

export const sequenceStepSchema = z.object({
  step_number: z.number().int().min(0),
  delay_days: z.number().int().min(0).default(0),
  delay_hours: z.number().int().min(0).max(23).default(0),
  step_type: z.enum(["email"]).default("email"),
  template_id: z.string().uuid().nullable().default(null),
  subject_override: z.string().nullable().default(null),
  body_override: z.string().nullable().default(null),
});

export type SequenceStep = z.infer<typeof sequenceStepSchema>;

export const sequenceStepsArraySchema = z
  .array(sequenceStepSchema)
  .min(1, "At least one sequence step is required");

export const sendWindowSchema = z.object({
  send_window_start: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
    .default("09:00"),
  send_window_end: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
    .default("17:00"),
  send_window_timezone: z.string().default("America/New_York"),
  send_window_days: z
    .array(z.number().int().min(1).max(7))
    .min(1, "At least one send day is required")
    .default([1, 2, 3, 4, 5]),
});

export type SendWindowConfig = z.infer<typeof sendWindowSchema>;
