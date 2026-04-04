import { Composio } from "@composio/core";
import { env } from "@/lib/config/env";

let _composio: Composio | null = null;

function getComposio(): Composio {
  if (!_composio) {
    _composio = new Composio({ apiKey: env.COMPOSIO_API_KEY });
  }
  return _composio;
}

export async function createComposioSession(userId: string) {
  return getComposio().create(userId);
}

export async function getGmailToolkit(userId: string) {
  const session = await createComposioSession(userId);
  const tools = await session.tools();
  return { session, tools };
}

export async function initiateGmailConnection(userId: string, callbackUrl?: string) {
  const session = await createComposioSession(userId);
  const connection = await session.authorize(
    "gmail",
    callbackUrl ? { callbackUrl } : undefined,
  );
  return connection;
}

export async function executeComposioTool(
  toolSlug: string,
  userId: string,
  args: Record<string, unknown>,
  connectedAccountId?: string,
) {
  return getComposio().tools.execute(toolSlug, {
    userId,
    arguments: args,
    ...(connectedAccountId ? { connectedAccountId } : {}),
    dangerouslySkipVersionCheck: true,
  });
}
