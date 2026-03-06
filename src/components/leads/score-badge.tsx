import { Badge } from "@/components/ui/badge";

export function ScoreBadge({ score }: { score: number }) {
  if (score >= 75) return <Badge className="bg-emerald-600 text-white">{score}</Badge>;
  if (score >= 50) return <Badge className="bg-amber-500 text-black">{score}</Badge>;
  return <Badge variant="secondary">{score}</Badge>;
}
