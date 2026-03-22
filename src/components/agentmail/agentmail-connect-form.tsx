"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";

type Domain = {
  id: string;
  domain: string;
  verified: boolean;
};

export function AgentMailConnectForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [domain, setDomain] = useState("agentmail.to");
  const [domains, setDomains] = useState<Domain[]>([
    { id: "default", domain: "agentmail.to", verified: true },
  ]);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/agentmail/domains")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.domains?.length) {
          setDomains(data.domains);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDomains(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/agentmail/inboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName || undefined,
          username: username || undefined,
          domain: domain !== "agentmail.to" ? domain : undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to create inbox");
      } else {
        setSuccess(`Inbox created: ${data.inbox.email}`);
        setDisplayName("");
        setUsername("");
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/agentmail/inboxes/sync", {
        method: "POST",
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to sync inboxes");
      } else {
        setSuccess(
          data.imported > 0
            ? `Synced ${data.imported} new inbox${data.imported > 1 ? "es" : ""} (${data.total} total in AgentMail)`
            : `All ${data.total} AgentMail inbox${data.total !== 1 ? "es" : ""} already synced`,
        );
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Create a new AgentMail inbox or sync existing inboxes from your AgentMail account.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Display Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Sales Team"
              className="w-[200px]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Username (optional)</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="sales"
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Domain</label>
            <Select value={domain} onValueChange={setDomain} disabled={loadingDomains}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select domain" />
              </SelectTrigger>
              <SelectContent>
                {domains
                  .filter((d) => d.verified)
                  .map((d) => (
                    <SelectItem key={d.id} value={d.domain}>
                      {d.domain}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Inbox"}
          </Button>
        </div>
      </form>
      <div className="flex items-center gap-3 border-t pt-3">
        <Button variant="outline" onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync Existing Inboxes"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Import inboxes already created in your AgentMail account
        </p>
      </div>
      {success && <p className="text-sm text-emerald-600">{success}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
