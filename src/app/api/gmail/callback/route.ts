import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status =
      searchParams.get("status") ??
      searchParams.get("connectionStatus") ??
      "";
    const connectedAccountId =
      searchParams.get("connected_account_id") ??
      searchParams.get("connectedAccountId");
    const userId =
      searchParams.get("userId") ??
      searchParams.get("user_id");
    const email =
      searchParams.get("email") ??
      searchParams.get("expectedEmail") ??
      (userId?.includes("@") ? userId : null);
    const displayName = searchParams.get("displayName");

    if (!userId || !email) {
      throw new Error("Missing userId or email in callback");
    }
    if (status && status !== "success") {
      const failedUrl = new URL("/settings", request.url);
      failedUrl.searchParams.set("gmailConnectStatus", "error");
      failedUrl.searchParams.set("gmailConnectError", "oauth_failed");
      return NextResponse.redirect(failedUrl);
    }

    const { error } = await supabaseServer.from("email_accounts").upsert(
      {
        gmail_address: email.trim().toLowerCase(),
        display_name: displayName ?? null,
        composio_user_id: userId,
        composio_connected_account_id: connectedAccountId ?? null,
        connection_status: connectedAccountId ? "connected" : "pending",
        last_connected_at: new Date().toISOString(),
        warmup_status: "new",
        is_active: true,
      },
      { onConflict: "gmail_address" },
    );

    if (error) {
      throw new Error(error.message);
    }

    const okUrl = new URL("/settings", request.url);
    okUrl.searchParams.set("gmailConnectStatus", "success");
    okUrl.searchParams.set("gmailEmail", email.trim().toLowerCase());
    return NextResponse.redirect(okUrl);
  } catch (error) {
    const failedUrl = new URL("/settings", request.url);
    failedUrl.searchParams.set("gmailConnectStatus", "error");
    failedUrl.searchParams.set(
      "gmailConnectError",
      error instanceof Error ? error.message : "Callback handling failed",
    );
    return NextResponse.redirect(failedUrl);
  }
}
