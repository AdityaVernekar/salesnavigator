import { executeComposioTool } from "@/lib/composio/client";
import { supabaseServer } from "@/lib/supabase/server";

interface RawWithData {
  threadId?: string;
  thread_id?: string;
  messages?: unknown[];
  data?: {
    threadId?: string;
    thread_id?: string;
    messages?: unknown[];
  };
}

export async function sendEmailWithComposio(
  accountId: string,
  to: string,
  subject: string,
  bodyHtml: string,
  bodyText?: string,
  options?: { forceTextMode?: boolean; threadId?: string },
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
  const replyThreadId = options?.threadId?.trim();

  const extractThreadId = (value: unknown) => {
    const response = value as RawWithData;
    return (
      response.threadId ??
      response.thread_id ??
      response.data?.threadId ??
      response.data?.thread_id
    );
  };

  if (replyThreadId) {
    if (forceTextMode) {
      mode = "text";
      raw = await executeComposioTool(
        "GMAIL_REPLY_TO_THREAD",
        account.composio_user_id,
        {
          thread_id: replyThreadId,
          recipient_email: to,
          message_body: (bodyText?.trim() || bodyHtml).trim(),
          is_html: false,
        },
        account.composio_connected_account_id ?? undefined,
      );
      return {
        threadId: extractThreadId(raw) ?? replyThreadId,
        raw,
        mode,
      };
    }

    try {
      raw = await executeComposioTool(
        "GMAIL_REPLY_TO_THREAD",
        account.composio_user_id,
        {
          thread_id: replyThreadId,
          recipient_email: to,
          message_body: bodyHtml,
          is_html: true,
        },
        account.composio_connected_account_id ?? undefined,
      );
    } catch (error) {
      if (!bodyText?.trim().length) throw error;
      mode = "text";
      raw = await executeComposioTool(
        "GMAIL_REPLY_TO_THREAD",
        account.composio_user_id,
        {
          thread_id: replyThreadId,
          recipient_email: to,
          message_body: bodyText,
          is_html: false,
        },
        account.composio_connected_account_id ?? undefined,
      );
    }

    return {
      threadId: extractThreadId(raw) ?? replyThreadId,
      raw,
      mode,
    };
  }

  if (forceTextMode) {
    mode = "text";
    raw = await executeComposioTool(
      "GMAIL_SEND_EMAIL",
      account.composio_user_id,
      {
        to,
        subject,
        body: (bodyText?.trim() || bodyHtml).trim(),
        is_html: false,
      },
      account.composio_connected_account_id ?? undefined,
    );
    return {
      threadId: extractThreadId(raw),
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
        is_html: true,
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
        is_html: false,
      },
      account.composio_connected_account_id ?? undefined,
    );
  }

  return {
    threadId: extractThreadId(raw),
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
