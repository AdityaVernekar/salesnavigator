import { Badge } from "@/components/ui/badge";

export function ClassificationBadge({ value }: { value: string }) {
  if (value === "INTERESTED") return <Badge className="bg-emerald-600 text-white">{value}</Badge>;
  if (value === "NOT_INTERESTED") return <Badge variant="destructive">{value}</Badge>;
  return <Badge variant="outline">{value}</Badge>;
}
