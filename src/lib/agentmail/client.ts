import { AgentMailClient } from "agentmail";

let _client: AgentMailClient | null = null;

export function getAgentMailClient(): AgentMailClient {
  if (!_client) {
    const apiKey = process.env.AGENTMAIL_API_KEY;
    if (!apiKey) {
      throw new Error("AGENTMAIL_API_KEY environment variable is not set");
    }
    _client = new AgentMailClient({ apiKey });
  }
  return _client;
}
