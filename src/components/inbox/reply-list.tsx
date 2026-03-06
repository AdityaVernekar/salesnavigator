import { ClassificationBadge } from "@/components/inbox/classification-badge";
import { Card, CardContent } from "@/components/ui/card";

export interface ReplyItem {
  id: string;
  to_email: string;
  subject: string;
  classification: string;
}

export function ReplyList({ items }: { items: ReplyItem[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="p-3">
            <div className="font-medium">{item.subject || "(No subject)"}</div>
            <div className="mt-1 text-sm text-muted-foreground">{item.to_email}</div>
            <div className="mt-2">
              <ClassificationBadge value={item.classification || "UNCLASSIFIED"} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
