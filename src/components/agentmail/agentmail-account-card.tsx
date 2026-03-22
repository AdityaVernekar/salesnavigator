"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";

export function AgentMailAccountCard({
  id,
  email,
  displayName,
  isActive,
  sendsToday,
  dailyLimit,
  createdAt,
  toggleAction,
}: {
  id: string;
  email: string;
  displayName?: string | null;
  isActive: boolean;
  sendsToday: number;
  dailyLimit: number;
  createdAt?: string | null;
  toggleAction: (formData: FormData) => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this AgentMail inbox? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await fetch(`/api/agentmail/inboxes?accountId=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{email}</CardTitle>
          {displayName && (
            <p className="text-xs text-muted-foreground">{displayName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isActive ? "outline" : "destructive"}>
            {isActive ? "active" : "inactive"}
          </Badge>
          <Badge variant="secondary">AgentMail</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          Sends today: {sendsToday}/{dailyLimit}
        </p>
        {createdAt && (
          <p className="text-xs text-muted-foreground">
            Created: {new Date(createdAt).toISOString().split("T")[0]}
          </p>
        )}
        <div className="flex items-center gap-2 pt-1">
          <form action={toggleAction}>
            <input type="hidden" name="accountId" value={id} />
            <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
            <Button type="submit" size="sm" variant="outline">
              {isActive ? "Deactivate" : "Activate"}
            </Button>
          </form>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
