import { AgentConfigForm } from "@/components/agents/agent-config-form";
import { normalizeAgentConfigType } from "@/lib/agents/config-db";
import { notFound } from "next/navigation";

export default async function AgentTypeConfigPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const normalizedType = normalizeAgentConfigType(type);
  if (!normalizedType) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Agent Config: {normalizedType}</h1>
      <AgentConfigForm type={normalizedType} />
    </div>
  );
}
