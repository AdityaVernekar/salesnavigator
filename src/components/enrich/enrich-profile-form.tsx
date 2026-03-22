"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ExternalLink, UserPlus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type EnrichState = "idle" | "loading" | "done" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

type ProfileData = Record<string, unknown>;

function extractField(profile: ProfileData, ...keys: string[]): string {
  for (const key of keys) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function extractProfileFields(raw: ProfileData) {
  // Clado nests core fields under "profile", merge with top-level for uniform access
  const nested =
    typeof raw.profile === "object" && raw.profile !== null
      ? (raw.profile as ProfileData)
      : {};
  const merged: ProfileData = { ...raw, ...nested };

  // Extract current company from experience array
  let currentCompany = "";
  let currentCompanyDomain = "";
  if (Array.isArray(raw.experience)) {
    const current = (raw.experience as ProfileData[]).find(
      (exp) => exp.is_current === true,
    );
    if (current) {
      currentCompany = extractField(current, "employer_name");
      const domains = current.employer_company_website_domains;
      if (Array.isArray(domains) && typeof domains[0] === "string") {
        currentCompanyDomain = domains[0];
      }
    }
  }

  return {
    name:
      extractField(merged, "full_name", "name") ||
      [
        extractField(merged, "first_name"),
        extractField(merged, "last_name"),
      ]
        .filter(Boolean)
        .join(" "),
    headline: extractField(merged, "headline", "title", "occupation"),
    email: extractField(merged, "email", "personal_email", "work_email"),
    companyName:
      extractField(merged, "company_name", "company", "current_company") ||
      currentCompany,
    companyDomain:
      extractField(merged, "company_domain", "company_website", "domain") ||
      currentCompanyDomain,
    location: extractField(merged, "location", "city", "country"),
    summary: extractField(merged, "summary", "about", "bio"),
    profilePicture: extractField(
      merged,
      "profile_picture_url",
      "profile_pic_url",
      "profile_picture",
      "avatar",
      "photo_url",
    ),
  };
}

export function EnrichProfileForm() {
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [enrichState, setEnrichState] = useState<EnrichState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rawProfile, setRawProfile] = useState<ProfileData | null>(null);
  const [profileSummary, setProfileSummary] = useState<string | null>(null);
  const [savedLeadId, setSavedLeadId] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  async function handleEnrich() {
    setError(null);
    setRawProfile(null);
    setProfileSummary(null);
    setSaveState("idle");
    setSavedLeadId(null);
    setEnrichState("loading");

    try {
      const res = await fetch("/api/enrich/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl: linkedinUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to enrich profile");
        setEnrichState("error");
        return;
      }
      setRawProfile(data.profile as ProfileData);
      setProfileSummary(typeof data.summary === "string" ? data.summary : null);
      setEnrichState("done");
    } catch {
      setError("Network error — please try again");
      setEnrichState("error");
    }
  }

  async function handleSaveAsLead() {
    if (!rawProfile) return;
    setSaveError(null);
    setSaveState("saving");

    const fields = extractProfileFields(rawProfile);

    try {
      const res = await fetch("/api/enrich/save-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.name || "Unknown",
          email: fields.email || undefined,
          headline: fields.headline || undefined,
          linkedinUrl: linkedinUrl.trim(),
          companyName: fields.companyName || undefined,
          companyDomain: fields.companyDomain || undefined,
          cladoProfile: rawProfile,
          summary: profileSummary || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSaveError(data.error ?? "Failed to save lead");
        setSaveState("error");
        return;
      }
      setSavedLeadId(data.leadId);
      setSaveState("saved");
    } catch {
      setSaveError("Network error — please try again");
      setSaveState("error");
    }
  }

  const profile = rawProfile ? extractProfileFields(rawProfile) : null;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex gap-2">
        <Input
          placeholder="https://linkedin.com/in/username"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && linkedinUrl.trim()) handleEnrich();
          }}
        />
        <Button
          onClick={handleEnrich}
          disabled={!linkedinUrl.trim() || enrichState === "loading"}
        >
          {enrichState === "loading" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enriching…
            </>
          ) : (
            "Enrich"
          )}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {profile && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {profile.profilePicture && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.profilePicture}
                    alt={profile.name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                )}
                <div>
                  <CardTitle className="text-lg">{profile.name || "Unknown"}</CardTitle>
                  {profile.headline && (
                    <p className="text-sm text-muted-foreground">
                      {profile.headline}
                    </p>
                  )}
                </div>
              </div>
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {profile.companyName && (
                <Badge variant="secondary">{profile.companyName}</Badge>
              )}
              {profile.location && (
                <Badge variant="outline">{profile.location}</Badge>
              )}
              {profile.email && (
                <Badge variant="outline">{profile.email}</Badge>
              )}
              {profile.companyDomain && (
                <Badge variant="outline">{profile.companyDomain}</Badge>
              )}
            </div>

            {profileSummary && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="font-medium text-xs text-muted-foreground mb-1">
                  AI Summary
                </p>
                <p className="text-sm whitespace-pre-line">
                  {profileSummary}
                </p>
              </div>
            )}

            {profile.summary && (
              <div>
                <p className="font-medium text-xs text-muted-foreground mb-1">
                  About
                </p>
                <p className="text-sm whitespace-pre-line">
                  {profile.summary.length > 500
                    ? `${profile.summary.slice(0, 500)}…`
                    : profile.summary}
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              {saveState === "saved" && savedLeadId ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Saved!</span>
                  <Link
                    href={`/leads/${savedLeadId}`}
                    className="underline hover:no-underline"
                  >
                    View lead
                  </Link>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveAsLead}
                  disabled={saveState === "saving"}
                >
                  {saveState === "saving" ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-3 w-3" />
                      Save as Lead
                    </>
                  )}
                </Button>
              )}
              {saveError && (
                <p className="text-sm text-destructive">{saveError}</p>
              )}
            </div>

            <div className="pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowRaw(!showRaw)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                {showRaw ? "Hide" : "Show"} raw enrichment data
              </button>
              {showRaw && (
                <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted p-3 text-xs">
                  {JSON.stringify(rawProfile, null, 2)}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
