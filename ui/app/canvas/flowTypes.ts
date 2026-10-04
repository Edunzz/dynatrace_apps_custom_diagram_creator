import type { Edge, Node } from "@xyflow/react";
import type { CustomNodeData, DiagramEdge, DiagramNode, EdgeKpi, EntityNodeData } from "../model/schema";

export type EntityFlowNode = Node<EntityNodeData, "entityNode">;
export type CustomFlowNode = Node<CustomNodeData, "customNode">;
export type FlowNode = EntityFlowNode | CustomFlowNode;

export type FlowEdgeData = {
  direction: DiagramEdge["direction"];
  label?: string;
  kpi?: EdgeKpi;
};
export type FlowEdge = Edge<FlowEdgeData, "normal" | "kpi">;

export const ENTITY_NODE_WIDTH = 240;
export const CUSTOM_NODE_DEFAULT = { w: 280, h: 200 };

export function toFlowNodes(nodes: DiagramNode[]): FlowNode[] {
  return nodes.map((n): FlowNode => {
    if (n.data.kind === "entity") {
      // Default width with auto height; a saved size (after a manual resize) fixes both.
      return {
        id: n.id,
        type: "entityNode",
        position: n.position,
        data: n.data,
        width: n.size?.w ?? ENTITY_NODE_WIDTH,
        height: n.size?.h,
      };
    }
    const size = n.size ?? CUSTOM_NODE_DEFAULT;
    return { id: n.id, type: "customNode", position: n.position, data: n.data, width: size.w, height: size.h };
  });
}

export function fromFlowNodes(nodes: FlowNode[]): DiagramNode[] {
  return nodes.map((n): DiagramNode => {
    const position = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    if (n.type === "customNode") {
      const w = n.width ?? n.measured?.width ?? CUSTOM_NODE_DEFAULT.w;
      const h = n.height ?? n.measured?.height ?? CUSTOM_NODE_DEFAULT.h;
      return { id: n.id, type: "customNode", position, size: { w: Math.round(w), h: Math.round(h) }, data: n.data };
    }
    if (n.height !== undefined) {
      const w = n.width ?? n.measured?.width ?? ENTITY_NODE_WIDTH;
      return { id: n.id, type: "entityNode", position, size: { w: Math.round(w), h: Math.round(n.height) }, data: n.data };
    }
    return { id: n.id, type: "entityNode", position, data: n.data };
  });
}

export function toFlowEdges(edges: DiagramEdge[]): FlowEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    type: e.type,
    data: { direction: e.direction, label: e.label, kpi: e.kpi },
  }));
}

export function fromFlowEdges(edges: FlowEdge[]): DiagramEdge[] {
  return edges.map((e): DiagramEdge => {
    const data = e.data ?? { direction: "forward" };
    const edge: DiagramEdge = {
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type === "kpi" ? "kpi" : "normal",
      direction: data.direction ?? "forward",
    };
    if (e.sourceHandle) {
      edge.sourceHandle = e.sourceHandle;
    }
    if (e.targetHandle) {
      edge.targetHandle = e.targetHandle;
    }
    if (data.label) {
      edge.label = data.label;
    }
    if (edge.type === "kpi" && data.kpi) {
      edge.kpi = data.kpi;
    }
    return edge;
  });
}
