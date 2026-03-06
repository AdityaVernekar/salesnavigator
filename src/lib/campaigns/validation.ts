import { z } from "zod";

export const leadTargetSchema = z.coerce
  .number({
    invalid_type_error: "Lead target must be a number.",
  })
  .int("Lead target must be a whole number.")
  .min(1, "Lead target must be at least 1.")
  .max(100, "Lead target cannot exceed 100.");
