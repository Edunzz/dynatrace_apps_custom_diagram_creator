import { graphlib, layout } from "@dagrejs/dagre";
import { CUSTOM_NODE_DEFAULT, ENTITY_NODE_WIDTH, type FlowEdge, type FlowNode } from "./flowTypes";

function sizeOf(node: FlowNode): { w: number; h: number } {
  const w = node.measured?.width ?? node.width ?? (node.type === "customNode" ? CUSTOM_NODE_DEFAULT.w : ENTITY_NODE_WIDTH);
  const h = node.measured?.height ?? node.height ?? (node.type === "customNode" ? CUSTOM_NODE_DEFAULT.h : 60);
  return { w, h };
}

/** "Auto-arrange" («Ordenar automáticamente»): left-to-right layers with dagre. */
export function autoLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 140, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) {
    const { w, h } = sizeOf(node);
    g.setNode(node.id, { width: w, height: h });
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }
  layout(g);
  return nodes.map((node) => {
    const p = g.node(node.id) as { x: number; y: number } | undefined;
    if (!p) {
      return node;
    }
    const { w, h } = sizeOf(node);
    return { ...node, position: { x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2) } };
  });
}
