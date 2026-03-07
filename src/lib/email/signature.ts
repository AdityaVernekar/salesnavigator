import { htmlToPlainText } from "@/lib/email/templates";

export function sanitizeSignatureHtml(signatureHtml: string | null | undefined) {
  const source = String(signatureHtml ?? "").trim();
  if (!source) return "";
  return source
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

export function appendSignatureHtml(
  bodyHtml: string,
  signatureHtml: string | null | undefined,
) {
  const cleanSignature = sanitizeSignatureHtml(signatureHtml);
  if (!cleanSignature) return bodyHtml;
  return `${bodyHtml}<br /><br />${cleanSignature}`;
}

export function appendSignatureText(
  bodyText: string,
  signatureHtml: string | null | undefined,
) {
  const cleanSignature = sanitizeSignatureHtml(signatureHtml);
  if (!cleanSignature) return bodyText;
  const signatureText = htmlToPlainText(cleanSignature);
  if (!signatureText) return bodyText;
  return `${bodyText}\n\n${signatureText}`;
}
