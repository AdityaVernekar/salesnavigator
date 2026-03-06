export function WarmupProgress({ day, total = 30 }: { day: number; total?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((day / total) * 100)));
  return (
    <div className="space-y-1">
      <div className="h-2 w-full rounded bg-muted">
        <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        Day {day}/{total}
      </p>
    </div>
  );
}
