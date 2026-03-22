import type { SequenceStep, SendWindowConfig } from "./sequence-schema";

type CampaignSendWindow = SendWindowConfig;

function parseTime(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { hour: h ?? 9, minute: m ?? 0 };
}

function getLocalParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const dayOfWeek = weekdayMap[parts.weekday] ?? 1;
  return { hour, minute, dayOfWeek };
}

function timeToMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

/**
 * Compute the raw "earliest eligible" time for the next step
 * based on delay_days + delay_hours from the step definition.
 */
export function computeNextStepAt(
  stepCompletedAt: Date,
  nextStep: SequenceStep,
): Date {
  const ms =
    (nextStep.delay_days * 24 * 60 + nextStep.delay_hours * 60) * 60_000;
  return new Date(stepCompletedAt.getTime() + ms);
}

/**
 * Adjust a raw eligible time into the campaign's send window,
 * respecting the contact's timezone.
 */
export function applySchedulingWindow(
  rawTime: Date,
  window: CampaignSendWindow,
  contactTimezone: string | null,
): Date {
  const tz = contactTimezone || window.send_window_timezone || "UTC";
  const windowStart = parseTime(window.send_window_start);
  const windowEnd = parseTime(window.send_window_end);
  const allowedDays = new Set(window.send_window_days);

  const startMinutes = timeToMinutes(windowStart.hour, windowStart.minute);
  const endMinutes = timeToMinutes(windowEnd.hour, windowEnd.minute);

  let candidate = new Date(rawTime);

  // Try up to 14 days to find a valid slot
  for (let attempt = 0; attempt < 14; attempt++) {
    const local = getLocalParts(candidate, tz);
    const localMinutes = timeToMinutes(local.hour, local.minute);

    if (allowedDays.has(local.dayOfWeek)) {
      if (localMinutes >= startMinutes && localMinutes < endMinutes) {
        return candidate;
      }
      if (localMinutes < startMinutes) {
        // Advance to window start today
        const diffMs = (startMinutes - localMinutes) * 60_000;
        return new Date(candidate.getTime() + diffMs);
      }
    }

    // Advance to the start of the next day's window
    const minutesUntilMidnight = (24 * 60 - timeToMinutes(local.hour, local.minute)) * 60_000;
    candidate = new Date(candidate.getTime() + minutesUntilMidnight + startMinutes * 60_000);
  }

  // Fallback: send at raw time if no valid window found within 14 days
  return rawTime;
}

/**
 * Check if the current moment falls within the campaign's send window
 * for a given contact timezone.
 */
export function isWithinSendWindow(
  now: Date,
  window: CampaignSendWindow,
  contactTimezone: string | null,
): boolean {
  const tz = contactTimezone || window.send_window_timezone || "UTC";
  const local = getLocalParts(now, tz);
  const allowedDays = new Set(window.send_window_days);

  if (!allowedDays.has(local.dayOfWeek)) return false;

  const windowStart = parseTime(window.send_window_start);
  const windowEnd = parseTime(window.send_window_end);
  const localMinutes = timeToMinutes(local.hour, local.minute);
  const startMinutes = timeToMinutes(windowStart.hour, windowStart.minute);
  const endMinutes = timeToMinutes(windowEnd.hour, windowEnd.minute);

  return localMinutes >= startMinutes && localMinutes < endMinutes;
}
