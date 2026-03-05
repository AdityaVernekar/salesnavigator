import { executeComposioTool } from "@/lib/composio/client";
import { supabaseServer } from "@/lib/supabase/server";

interface RawWithData {
  threadId?: string;
  messages?: unknown[];
  data?: {
    threadId?: string;
    messages?: unknown[];
  };
}

export async function sendEmailWithComposio(
  accountId: string,
  to: string,
  subject: string,
  bodyHtml: string,
  bodyText?: string,
  options?: { forceTextMode?: boolean },
): Promise<{ threadId?: string; raw: unknown; mode: "html" | "text" }> {
  const { data: account } = await supabaseServer
    .from("email_accounts")
    .select("composio_user_id,composio_connected_account_id")
    .eq("id", accountId)
    .single();

  if (!account?.composio_user_id) {
    throw new Error("Missing Composio user mapping for account");
  }

  let raw: unknown;
  let mode: "html" | "text" = "html";
  const forceTextMode = Boolean(options?.forceTextMode);

  if (forceTextMode) {
    mode = "text";
    raw = await executeComposioTool(
      "GMAIL_SEND_EMAIL",
      account.composio_user_id,
      {
        to,
        subject,
        body: (bodyText?.trim() || bodyHtml).trim(),
        content_type: "text/plain",
      },
      account.composio_connected_account_id ?? undefined,
    );
    const response = raw as RawWithData;
    return {
      threadId: response.threadId ?? response.data?.threadId,
      raw,
      mode,
    };
  }

  try {
    raw = await executeComposioTool(
      "GMAIL_SEND_EMAIL",
      account.composio_user_id,
      {
        to,
        subject,
        body: bodyHtml,
        content_type: "text/html",
      },
      account.composio_connected_account_id ?? undefined,
    );
  } catch (error) {
    if (!bodyText?.trim().length) throw error;
    mode = "text";
    raw = await executeComposioTool(
      "GMAIL_SEND_EMAIL",
      account.composio_user_id,
      {
        to,
        subject,
        body: bodyText,
        content_type: "text/plain",
      },
      account.composio_connected_account_id ?? undefined,
    );
  }

  const response = raw as RawWithData;
  return {
    threadId: response.threadId ?? response.data?.threadId,
    raw,
    mode,
  };
}

export async function readInboxWithComposio(accountId: string, query: string): Promise<unknown[]> {
  const { data: account } = await supabaseServer
    .from("email_accounts")
    .select("composio_user_id,composio_connected_account_id")
    .eq("id", accountId)
    .single();

  if (!account?.composio_user_id) {
    throw new Error("Missing Composio user mapping for account");
  }

  const raw = await executeComposioTool(
    "GMAIL_GET_MESSAGES",
    account.composio_user_id,
    {
      query,
      max_results: 25,
    },
    account.composio_connected_account_id ?? undefined,
  );

  const response = raw as RawWithData;
  const messages = response.messages ?? response.data?.messages ?? [];
  return Array.isArray(messages) ? messages : [];
}
