import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramEdge, DiagramNode } from "../model/schema";
import type { DiagramStatus, EdgeStatus, NodeStatus, Timeframe } from "../model/types";
import { isAbortError } from "../services/dql";
import { computeDiagramStatus, createCycleContext } from "../services/statusEngine";
import { resolveTimeframe } from "../services/time";

export interface RefreshScope {
  nodeIds?: string[];
  edgeIds?: string[];
}

/**
 * Canvas status engine. Recomputes on: load, timeframe change, manual refresh,
 * auto-refresh tick and saving an element's configuration (scoped refresh).
 * A full refresh cancels (AbortController) the previous cycle.
 */
export function useDiagramStatus(
  getElements: () => { nodes: DiagramNode[]; edges: DiagramEdge[] },
  timeframe: Timeframe,
  enabled: boolean,
) {
  const [status, setStatus] = useState<DiagramStatus>({ nodes: {}, edges: {} });
  const [refreshing, setRefreshing] = useState(false);
  const controllersRef = useRef(new Set<AbortController>());
  const getElementsRef = useRef(getElements);

  useEffect(() => {
    getElementsRef.current = getElements;
  }, [getElements]);

  const refresh = useCallback(
    async (scope?: RefreshScope) => {
      if (!scope) {
        controllersRef.current.forEach((c) => c.abort());
        controllersRef.current.clear();
      }
      const controller = new AbortController();
      controllersRef.current.add(controller);

      const tf = resolveTimeframe(timeframe);
      const { nodes, edges } = getElementsRef.current();
      const targetNodes = scope ? nodes.filter((n) => scope.nodeIds?.includes(n.id)) : nodes;
      const targetEdges = scope ? edges.filter((e) => scope.edgeIds?.includes(e.id)) : edges;

      // While refreshing, each element keeps its color; it switches to "loading" if it had no status
      // or if it is the one that was just configured (scoped refresh).
      const targetNodeIds = new Set(targetNodes.map((n) => n.id));
      const targetEdgeIds = new Set(targetEdges.map((e) => e.id));
      setStatus((prev) => {
        const nextNodes: Record<string, NodeStatus> = {};
        for (const n of nodes) {
          const previous = prev.nodes[n.id];
          const isTarget = targetNodeIds.has(n.id);
          if (isTarget && (scope || !previous)) {
            nextNodes[n.id] = { status: "loading" };
          } else if (previous) {
            nextNodes[n.id] = previous;
          }
        }
        const nextEdges: Record<string, EdgeStatus> = {};
        for (const e of edges) {
          const previous = prev.edges[e.id];
          const isTarget = targetEdgeIds.has(e.id);
          if (isTarget && (scope || !previous)) {
            nextEdges[e.id] = { status: "loading" };
          } else if (previous) {
            nextEdges[e.id] = previous;
          }
        }
        return { ...prev, nodes: nextNodes, edges: nextEdges, resolvedTimeframe: tf };
      });

      setRefreshing(true);
      const ctx = createCycleContext(tf, controller.signal);
      try {
        await computeDiagramStatus(targetNodes, targetEdges, ctx, (partial) => {
          setStatus((prev) => ({
            ...prev,
            nodes: partial.nodes ? { ...prev.nodes, ...partial.nodes } : prev.nodes,
            edges: partial.edges ? { ...prev.edges, ...partial.edges } : prev.edges,
          }));
        });
        if (!controller.signal.aborted) {
          setStatus((prev) => ({ ...prev, lastUpdated: new Date() }));
        }
      } catch (e) {
        if (!isAbortError(e)) {
          console.error("Failed to compute the diagram status", e);
        }
      } finally {
        controllersRef.current.delete(controller);
        if (controllersRef.current.size === 0) {
          setRefreshing(false);
        }
      }
    },
    [timeframe],
  );

  // Initial load and timeframe change.
  useEffect(() => {
    if (enabled) {
      void refresh();
    }
  }, [enabled, refresh]);

  // Cancel everything on unmount.
  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((c) => c.abort());
      controllers.clear();
    };
  }, []);

  return { status, refresh, refreshing };
}
