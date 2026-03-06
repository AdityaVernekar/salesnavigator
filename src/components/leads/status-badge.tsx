import { Badge } from "@/components/ui/badge";

const statusClassMap: Record<string, string> = {
  new: "bg-slate-100 text-slate-900",
  enriching: "bg-blue-100 text-blue-900",
  enriched: "bg-indigo-100 text-indigo-900",
  scored: "bg-amber-100 text-amber-900",
  emailed: "bg-emerald-100 text-emerald-900",
  disqualified: "bg-red-100 text-red-900",
  error: "bg-red-600 text-white",
};

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  return (
    <Badge className={statusClassMap[normalized] ?? "bg-slate-100 text-slate-900"}>
      {normalized}
    </Badge>
  );
}
