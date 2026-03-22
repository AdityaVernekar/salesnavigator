"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { workflowNodeTypes } from "./workflow-nodes";
import { buildFlowFromSteps } from "./build-flow";
import type { SequenceStep } from "@/lib/workflows/sequence-schema";

export function WorkflowCanvas({
  steps,
}: {
  steps: SequenceStep[];
}) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowFromSteps(steps),
    [steps],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  return (
    <div className="h-[600px] w-full rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={workflowNodeTypes}
        proOptions={proOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={1.5}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: { stroke: "#52525b", strokeWidth: 2 },
        }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#27272a"
        />
        <Controls
          className="!bg-zinc-900 !border-zinc-700 !rounded-lg !shadow-lg [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-300 [&>button:hover]:!bg-zinc-700"
          position="top-right"
        />
        <MiniMap
          className="!bg-zinc-900 !border-zinc-700 !rounded-lg"
          nodeColor="#3f3f46"
          maskColor="rgba(0, 0, 0, 0.7)"
          position="bottom-right"
        />
      </ReactFlow>
    </div>
  );
}
