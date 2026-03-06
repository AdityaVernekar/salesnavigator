import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { initiateGmailConnection } from "@/lib/composio/client";

const connectSchema = z.object({
  email: z.string().email(),
});

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get("email") ?? "";
    const parsed = connectSchema.parse({ email });
    const normalizedEmail = parsed.email.trim().toLowerCase();
    const userId = normalizedEmail;
    const callbackUrl = new URL("/api/gmail/callback", env.NEXT_PUBLIC_APP_URL);
    callbackUrl.searchParams.set("email", normalizedEmail);
    callbackUrl.searchParams.set("userId", userId);

    const connection = await initiateGmailConnection(userId, callbackUrl.toString());
    const redirectUrl =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((connection as any)?.redirectUrl as string | undefined) ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((connection as any)?.url as string | undefined) ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((connection as any)?.data?.redirectUrl as string | undefined) ??
      null;
    if (redirectUrl) {
      return NextResponse.redirect(redirectUrl);
    }

    const fallback = new URL("/settings", request.url);
    fallback.searchParams.set("gmailConnectStatus", "error");
    fallback.searchParams.set("gmailConnectError", "missing_redirect_url");
    return NextResponse.redirect(fallback);
  } catch (error) {
    const fallback = new URL("/settings", request.url);
    fallback.searchParams.set("gmailConnectStatus", "error");
    fallback.searchParams.set(
      "gmailConnectError",
      error instanceof Error ? error.message : "Failed to initiate Gmail connection",
    );
    return NextResponse.redirect(fallback);
  }
}
