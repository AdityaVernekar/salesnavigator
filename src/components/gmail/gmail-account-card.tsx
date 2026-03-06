import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WarmupProgress } from "@/components/gmail/warmup-progress";

export function GmailAccountCard({
  gmail,
  status,
  connectionStatus,
  connectedAccountId,
  lastConnectedAt,
  sendsToday,
  dailyLimit,
  warmupDay,
  isActive,
  children,
}: {
  gmail: string;
  status: string;
  connectionStatus?: string | null;
  connectedAccountId?: string | null;
  lastConnectedAt?: string | null;
  sendsToday: number;
  dailyLimit: number;
  warmupDay: number;
  isActive: boolean;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{gmail}</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={isActive ? "outline" : "destructive"}>
            {isActive ? "active" : "inactive"}
          </Badge>
          <Badge variant="outline">{status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          Sends today: {sendsToday}/{dailyLimit}
        </p>
        <p className="text-xs text-muted-foreground">
          Connection: {connectionStatus ?? "pending"}{" "}
          {connectedAccountId ? `(${connectedAccountId.slice(0, 12)}...)` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          Last connected:{" "}
          {lastConnectedAt ? new Date(lastConnectedAt).toLocaleString() : "Never"}
        </p>
        <WarmupProgress day={warmupDay} />
        {children}
      </CardContent>
    </Card>
  );
}
