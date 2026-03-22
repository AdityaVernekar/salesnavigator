"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
});

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
] as const;

type SendWindowDefaults = {
  sendWindowStart?: string;
  sendWindowEnd?: string;
  sendWindowTimezone?: string;
  sendWindowDays?: number[];
};

export function SendWindowConfig({
  defaults,
}: {
  defaults?: SendWindowDefaults;
}) {
  const [startTime, setStartTime] = useState(
    defaults?.sendWindowStart ?? "09:00",
  );
  const [endTime, setEndTime] = useState(defaults?.sendWindowEnd ?? "17:00");
  const [timezone, setTimezone] = useState(
    defaults?.sendWindowTimezone ?? "America/New_York",
  );
  const [selectedDays, setSelectedDays] = useState<number[]>(
    defaults?.sendWindowDays ?? [1, 2, 3, 4, 5],
  );

  function toggleDay(day: number) {
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        if (prev.length <= 1) return prev;
        return prev.filter((d) => d !== day);
      }
      return [...prev, day].sort();
    });
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Send Window</Label>
      <p className="text-xs text-muted-foreground">
        Emails will only be sent during this window in the recipient&apos;s timezone.
      </p>

      <input type="hidden" name="send_window_start" value={startTime} readOnly />
      <input type="hidden" name="send_window_end" value={endTime} readOnly />
      <input type="hidden" name="send_window_timezone" value={timezone} readOnly />
      <input
        type="hidden"
        name="send_window_days"
        value={JSON.stringify(selectedDays)}
        readOnly
      />

      <div className="flex items-center gap-2">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Select value={startTime} onValueChange={setStartTime}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Select value={endTime} onValueChange={setEndTime}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1">
          <Label className="text-xs">Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Send Days</Label>
        <div className="flex gap-3">
          {DAYS.map((day) => (
            <label
              key={day.value}
              className="flex items-center gap-1 text-sm cursor-pointer"
            >
              <Checkbox
                checked={selectedDays.includes(day.value)}
                onCheckedChange={() => toggleDay(day.value)}
              />
              {day.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
