import type { Node, Edge } from "@xyflow/react";
import type { SequenceStep } from "@/lib/workflows/sequence-schema";
import type { WorkflowNodeData } from "./types";

const NODE_Y_GAP = 120;
const BRANCH_X_OFFSET = 300;
const CENTER_X = 400;

export function buildFlowFromSteps(steps: SequenceStep[]): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Trigger node
  nodes.push({
    id: "trigger",
    type: "trigger",
    position: { x: CENTER_X, y: 0 },
    data: {
      label: "Start",
      nodeType: "trigger",
      description: "Contact enrolled in campaign",
    } satisfies WorkflowNodeData,
  });

  let prevNodeId = "trigger";
  let yPos = NODE_Y_GAP;
  let emailStepCount = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const hasDelay = (step.delay_days > 0 || step.delay_hours > 0) && i > 0;

    // Add delay node before email (except first step)
    if (hasDelay) {
      const delayId = `delay-${i}`;
      nodes.push({
        id: delayId,
        type: "delay",
        position: { x: CENTER_X, y: yPos },
        data: {
          label: "Wait",
          nodeType: "delay",
          delayDays: step.delay_days,
          delayHours: step.delay_hours,
        } satisfies WorkflowNodeData,
      });
      edges.push({
        id: `e-${prevNodeId}-${delayId}`,
        source: prevNodeId,
        target: delayId,
        type: "smoothstep",
        style: { stroke: "#52525b", strokeWidth: 2 },
        animated: true,
      });
      prevNodeId = delayId;
      yPos += NODE_Y_GAP;
    }

    // Add condition node (check for reply) before follow-ups
    if (i > 0) {
      const conditionId = `condition-${i}`;
      nodes.push({
        id: conditionId,
        type: "condition",
        position: { x: CENTER_X, y: yPos },
        data: {
          label: "Reply received?",
          nodeType: "condition",
          conditionType: "replied",
          description: "Check if contact replied",
        } satisfies WorkflowNodeData,
      });
      edges.push({
        id: `e-${prevNodeId}-${conditionId}`,
        source: prevNodeId,
        target: conditionId,
        type: "smoothstep",
        style: { stroke: "#52525b", strokeWidth: 2 },
        animated: true,
      });

      // "Yes" branch -> end (replied)
      const repliedEndId = `end-replied-${i}`;
      nodes.push({
        id: repliedEndId,
        type: "end",
        position: { x: CENTER_X + BRANCH_X_OFFSET, y: yPos },
        data: {
          label: "Replied",
          nodeType: "end",
        } satisfies WorkflowNodeData,
      });
      edges.push({
        id: `e-${conditionId}-${repliedEndId}`,
        source: conditionId,
        sourceHandle: "yes",
        target: repliedEndId,
        type: "smoothstep",
        style: { stroke: "#22c55e", strokeWidth: 2 },
        label: "Yes",
        labelStyle: { fill: "#22c55e", fontSize: 11 },
        labelBgStyle: { fill: "#18181b" },
      });

      prevNodeId = conditionId;
      yPos += NODE_Y_GAP;
    }

    // Email node
    emailStepCount++;
    const emailId = `email-${i}`;
    const emailLabel =
      i === 0
        ? "Initial Email"
        : `Follow-up ${i}`;

    nodes.push({
      id: emailId,
      type: "email",
      position: { x: CENTER_X, y: yPos },
      data: {
        label: emailLabel,
        nodeType: "email",
        stepNumber: step.step_number,
        templateId: step.template_id,
        subjectOverride: step.subject_override,
        bodyOverride: step.body_override,
      } satisfies WorkflowNodeData,
    });

    const edgeSource = i > 0 ? prevNodeId : prevNodeId;
    const edgeProps =
      i > 0
        ? {
            sourceHandle: "no" as const,
            label: "No" as const,
            labelStyle: { fill: "#ef4444", fontSize: 11 },
            labelBgStyle: { fill: "#18181b" },
            style: { stroke: "#ef4444", strokeWidth: 2 },
          }
        : {
            style: { stroke: "#52525b", strokeWidth: 2 },
            animated: true,
          };

    edges.push({
      id: `e-${edgeSource}-${emailId}`,
      source: edgeSource,
      target: emailId,
      type: "smoothstep",
      ...edgeProps,
    });

    prevNodeId = emailId;
    yPos += NODE_Y_GAP;
  }

  // Final end node
  nodes.push({
    id: "end-complete",
    type: "end",
    position: { x: CENTER_X, y: yPos },
    data: {
      label: "Sequence Complete",
      nodeType: "end",
    } satisfies WorkflowNodeData,
  });
  edges.push({
    id: `e-${prevNodeId}-end-complete`,
    source: prevNodeId,
    target: "end-complete",
    type: "smoothstep",
    style: { stroke: "#52525b", strokeWidth: 2 },
    animated: true,
  });

  return { nodes, edges };
}
