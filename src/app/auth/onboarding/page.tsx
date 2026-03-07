"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Flow = "create_company" | "join_company";

export default function OnboardingPage() {
  const router = useRouter();
  const [flow, setFlow] = useState<Flow>("create_company");
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    const payload =
      flow === "create_company"
        ? { action: "create_company", companyName: companyName.trim() }
        : { action: "join_company", companyId: companyId.trim() };

    const response = await fetch("/api/auth/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);
    setIsSubmitting(false);

    if (!response.ok || !data?.ok) {
      setError(data?.error ?? "Could not complete onboarding");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center">
      <div className="w-full space-y-4 rounded border p-6">
        <div>
          <h1 className="text-xl font-semibold">Complete setup</h1>
          <p className="text-sm text-muted-foreground">
            Create a new company workspace, or join one with a company ID from
            your admin.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={flow === "create_company" ? "default" : "outline"}
            onClick={() => setFlow("create_company")}
          >
            Create company
          </Button>
          <Button
            type="button"
            variant={flow === "join_company" ? "default" : "outline"}
            onClick={() => setFlow("join_company")}
          >
            Join by company ID
          </Button>
        </div>

        {flow === "create_company" ? (
          <div className="space-y-2">
            <label htmlFor="companyName" className="text-sm">
              Company name
            </label>
            <Input
              id="companyName"
              placeholder="Lexsis"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="companyId" className="text-sm">
              Company ID
            </label>
            <Input
              id="companyId"
              placeholder="uuid-from-admin"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            />
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button
          type="button"
          className="w-full"
          disabled={
            isSubmitting ||
            (flow === "create_company"
              ? !companyName.trim()
              : !companyId.trim())
          }
          onClick={submit}
        >
          {isSubmitting
            ? "Saving..."
            : flow === "create_company"
              ? "Create company and continue"
              : "Join company and continue"}
        </Button>
      </div>
    </div>
  );
}
