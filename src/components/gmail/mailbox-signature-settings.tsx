"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

function SignatureEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const applyCommand = (command: "bold" | "italic" | "underline") => {
    editorRef.current?.focus();
    document.execCommand(command);
    onChange(editorRef.current?.innerHTML ?? "");
  };

  const insertLink = () => {
    const url = window.prompt("Enter link URL", "https://");
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand("createLink", false, url);
    onChange(editorRef.current?.innerHTML ?? "");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="outline" size="sm" onClick={() => applyCommand("bold")}>
          Bold
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => applyCommand("italic")}>
          Italic
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => applyCommand("underline")}>
          Underline
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={insertLink}>
          Add link
        </Button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="min-h-24 rounded border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onInput={() => onChange(editorRef.current?.innerHTML ?? "")}
      />
      <p className="text-xs text-muted-foreground">
        Rich signature HTML is saved for this mailbox and used in outbound emails.
      </p>
    </div>
  );
}

export function MailboxSignatureSettings({
  accountId,
  initialSignatureHtml,
  initialEnabledByDefault,
}: {
  accountId: string;
  initialSignatureHtml?: string | null;
  initialEnabledByDefault?: boolean | null;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [signatureHtml, setSignatureHtml] = useState(
    initialSignatureHtml?.trim().length
      ? initialSignatureHtml
      : "<p>Best,<br />Your Name</p>",
  );
  const [enabledByDefault, setEnabledByDefault] = useState(
    initialEnabledByDefault ?? true,
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  const saveSettings = () => {
    startSave(async () => {
      setFeedback(null);
      setError(null);
      try {
        const response = await fetch("/api/gmail/accounts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            signatureHtml,
            signatureEnabledByDefault: enabledByDefault,
          }),
        });
        const payload = (await response.json()) as { ok?: boolean; error?: string };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Failed to save signature settings.");
        }
        setFeedback("Signature settings saved.");
        router.refresh();
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to save signature settings.",
        );
      }
    });
  };

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="outline" onClick={() => setIsOpen((prev) => !prev)}>
        {isOpen ? "Hide signature settings" : "Edit signature"}
      </Button>
      {isOpen ? (
        <div className="space-y-3 rounded border p-3">
          <SignatureEditor value={signatureHtml} onChange={setSignatureHtml} />
          <Label className="flex items-center gap-2 text-xs font-normal">
            <Checkbox
              checked={enabledByDefault}
              onCheckedChange={(checked) => setEnabledByDefault(Boolean(checked))}
            />
            Use signature by default for automation sends
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={saveSettings} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save signature"}
            </Button>
            {feedback ? <p className="text-xs text-emerald-600">{feedback}</p> : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
