import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ContactDrawerProps {
  name: string;
  company: string;
  email?: string | null;
  headline?: string | null;
  linkedinUrl?: string | null;
  score?: number | null;
  tier?: string | null;
  reasoning?: string | null;
}

export function ContactDrawer({
  name,
  company,
  email,
  headline,
  linkedinUrl,
  score,
  tier,
  reasoning,
}: ContactDrawerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Detail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <strong>Name:</strong> {name}
        </p>
        <p>
          <strong>Company:</strong> {company}
        </p>
        <p>
          <strong>Email:</strong> {email ?? "Unknown"}
        </p>
        <p>
          <strong>Headline:</strong> {headline ?? "Unknown"}
        </p>
        <p>
          <strong>LinkedIn:</strong>{" "}
          {linkedinUrl ? (
            <a href={linkedinUrl} target="_blank" rel="noreferrer" className="text-primary underline">
              View Profile
            </a>
          ) : (
            "Unknown"
          )}
        </p>
        <p className="flex items-center gap-2">
          <strong>Score:</strong> {typeof score === "number" ? score : "--"}
          {tier ? (
            <Badge variant="secondary" className="uppercase">
              {tier}
            </Badge>
          ) : null}
        </p>
        <p>
          <strong>Reasoning:</strong> {reasoning ?? "No reasoning available"}
        </p>
      </CardContent>
    </Card>
  );
}
