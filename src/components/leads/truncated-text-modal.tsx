"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type TruncatedTextModalProps = {
  text: string | null | undefined;
  fallback?: string;
  modalTitle: string;
  modalDescription?: string;
  previewLength?: number;
  previewClassName?: string;
};

export function TruncatedTextModal({
  text,
  fallback = "--",
  modalTitle,
  modalDescription,
  previewLength = 160,
  previewClassName,
}: TruncatedTextModalProps) {
  const [open, setOpen] = useState(false);
  const fullText = useMemo(() => text ?? "", [text]);
  const previewSource = useMemo(() => fullText.replace(/\s+/g, " ").trim(), [fullText]);
  const hasText = previewSource.length > 0;
  const isTruncated = previewSource.length > previewLength;
  const previewText = isTruncated ? `${previewSource.slice(0, previewLength)}...` : previewSource;

  if (!hasText) {
    return <>{fallback}</>;
  }

  if (!isTruncated) {
    return <span className={previewClassName}>{previewText}</span>;
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Open full ${modalTitle}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`cursor-pointer text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          previewClassName ?? ""
        }`}
        onClick={() => setOpen(true)}
      >
        {previewText}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
            {modalDescription ? <DialogDescription>{modalDescription}</DialogDescription> : null}
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap wrap-break-word pr-1 text-sm">
            {fullText}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
