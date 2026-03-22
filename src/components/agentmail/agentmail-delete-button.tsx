"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AgentMailDeleteButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this AgentMail inbox? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await fetch(`/api/agentmail/inboxes?accountId=${accountId}`, {
        method: "DELETE",
      });
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs text-destructive hover:text-destructive"
      onClick={handleDelete}
      disabled={deleting}
    >
      {deleting ? "Deleting..." : "Delete"}
    </Button>
  );
}
