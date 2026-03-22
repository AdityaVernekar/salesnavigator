"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { WorkflowNodeData } from "./types";

function TriggerNode({ data }: NodeProps) {
  const d = data as unknown as WorkflowNodeData;
  return (
    <div className="rounded-lg border border-violet-500/50 bg-zinc-900 px-4 py-3 shadow-lg shadow-violet-500/10 min-w-[200px]">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-100">{d.label}</p>
          {d.description && (
            <p className="text-xs text-zinc-400">{d.description}</p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-violet-500 !w-2.5 !h-2.5 !border-zinc-800 !border-2" />
    </div>
  );
}

function EmailNode({ data }: NodeProps) {
  const d = data as unknown as WorkflowNodeData;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 shadow-lg min-w-[220px]">
      <Handle type="target" position={Position.Top} className="!bg-zinc-500 !w-2.5 !h-2.5 !border-zinc-800 !border-2" />
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-100">{d.label}</p>
          {d.subjectOverride && (
            <p className="text-xs text-zinc-400 truncate">{d.subjectOverride}</p>
          )}
          {d.templateId && (
            <p className="text-xs text-zinc-500">Using template</p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-500 !w-2.5 !h-2.5 !border-zinc-800 !border-2" />
    </div>
  );
}

function DelayNode({ data }: NodeProps) {
  const d = data as unknown as WorkflowNodeData;
  const delayText = [
    d.delayDays ? `${d.delayDays}d` : null,
    d.delayHours ? `${d.delayHours}h` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="rounded-lg border border-amber-500/40 bg-zinc-900 px-4 py-3 shadow-lg min-w-[180px]">
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-2.5 !h-2.5 !border-zinc-800 !border-2" />
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-100">{d.label}</p>
          <p className="text-xs text-amber-400">Wait {delayText || "0d"}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500 !w-2.5 !h-2.5 !border-zinc-800 !border-2" />
    </div>
  );
}

function ConditionNode({ data }: NodeProps) {
  const d = data as unknown as WorkflowNodeData;
  return (
    <div className="rounded-lg border border-purple-500/40 bg-zinc-900 px-4 py-3 shadow-lg min-w-[200px]">
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-2.5 !h-2.5 !border-zinc-800 !border-2" />
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M16 3h5v5" />
            <path d="M8 3H3v5" />
            <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
            <path d="m15 9 6-6" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-100">{d.label}</p>
          {d.description && (
            <p className="text-xs text-zinc-400">{d.description}</p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "30%" }} className="!bg-green-500 !w-2.5 !h-2.5 !border-zinc-800 !border-2" />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: "70%" }} className="!bg-red-500 !w-2.5 !h-2.5 !border-zinc-800 !border-2" />
    </div>
  );
}

function EndNode({ data }: NodeProps) {
  const d = data as unknown as WorkflowNodeData;
  return (
    <div className="rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 shadow-lg min-w-[160px]">
      <Handle type="target" position={Position.Top} className="!bg-zinc-500 !w-2.5 !h-2.5 !border-zinc-800 !border-2" />
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <rect x="8" y="8" width="8" height="8" rx="1" />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-100">{d.label}</p>
      </div>
    </div>
  );
}

export const workflowNodeTypes = {
  trigger: TriggerNode,
  email: EmailNode,
  delay: DelayNode,
  condition: ConditionNode,
  end: EndNode,
};
