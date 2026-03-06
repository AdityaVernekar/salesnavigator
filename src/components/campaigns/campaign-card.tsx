import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CampaignCard({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{name}</CardTitle>
        <Badge variant="outline">{status}</Badge>
      </CardHeader>
      <CardContent>
        <Link href={`/campaigns/${id}`} className="text-sm text-primary underline">
          Open campaign
        </Link>
      </CardContent>
    </Card>
  );
}
