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
    <div className="h-[600px] w-full rounded-lg border border-zinc-200 bg-white overflow-hidden">
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
          style: { stroke: "#d4d4d8", strokeWidth: 2 },
        }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#e4e4e7"
        />
        <Controls
          className="!bg-white !border-zinc-200 !rounded-lg !shadow-sm [&>button]:!bg-white [&>button]:!border-zinc-200 [&>button]:!text-zinc-600 [&>button:hover]:!bg-zinc-50"
          position="top-right"
        />
        <MiniMap
          className="!bg-white !border-zinc-200 !rounded-lg"
          nodeColor="#e4e4e7"
          maskColor="rgba(255, 255, 255, 0.7)"
          position="bottom-right"
        />
      </ReactFlow>
    </div>
  );
}
