import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  new: { label: "New", color: "bg-slate-400", dot: "bg-slate-400" },
  enriching: { label: "Enriching", color: "bg-blue-500", dot: "bg-blue-500" },
  enriched: { label: "Enriched", color: "bg-cyan-500", dot: "bg-cyan-500" },
  scored: { label: "Scored", color: "bg-amber-500", dot: "bg-amber-500" },
  emailed: { label: "Emailed", color: "bg-green-500", dot: "bg-green-500" },
  disqualified: { label: "Disqualified", color: "bg-red-500", dot: "bg-red-500" },
  error: { label: "Error", color: "bg-rose-400", dot: "bg-rose-400" },
};

const STATUS_ORDER = ["new", "enriching", "enriched", "scored", "emailed", "disqualified", "error"];

interface LeadsPipelineBreakdownProps {
  leadsByStatus: Record<string, number>;
  total: number;
}

export function LeadsPipelineBreakdown({ leadsByStatus, total }: LeadsPipelineBreakdownProps) {
  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lead Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No leads yet. Run a pipeline to generate leads.</p>
        </CardContent>
      </Card>
    );
  }

  const segments = STATUS_ORDER.map((status) => ({
    status,
    count: leadsByStatus[status] ?? 0,
    pct: ((leadsByStatus[status] ?? 0) / total) * 100,
    ...STATUS_CONFIG[status],
  })).filter((s) => s.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead Pipeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stacked bar */}
        <div className="flex h-4 w-full overflow-hidden rounded-full">
          {segments.map((seg) => (
            <div
              key={seg.status}
              className={`${seg.color} transition-all`}
              style={{ width: `${seg.pct}%` }}
              title={`${seg.label}: ${seg.count} (${seg.pct.toFixed(1)}%)`}
            />
          ))}
        </div>

        {/* Legend grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          {STATUS_ORDER.map((status) => {
            const count = leadsByStatus[status] ?? 0;
            const cfg = STATUS_CONFIG[status];
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
            return (
              <div key={status} className="flex items-center gap-2 text-sm">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                <span className="text-muted-foreground">{cfg.label}</span>
                <span className="ml-auto font-medium tabular-nums">
                  {count} <span className="text-xs text-muted-foreground">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
