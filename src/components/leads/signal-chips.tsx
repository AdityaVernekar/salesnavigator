import { Badge } from "@/components/ui/badge";

export function SignalChips({ signals }: { signals: string[] }) {
  if (!signals.length) return <span className="text-xs text-muted-foreground">No signals</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {signals.map((signal) => (
        <Badge key={signal} variant="outline" className="text-xs">
          {signal}
        </Badge>
      ))}
    </div>
  );
}
