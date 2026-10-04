import { createContext, useContext, useEffect, useState } from "react";
import type { DiagramStatus } from "../model/types";

export type EditorMode = "edit" | "view";

export interface DiagramContextValue {
  status: DiagramStatus;
  mode: EditorMode;
  reducedMotion: boolean;
  openDetail: (kind: "node" | "edge", id: string) => void;
  openConfig: (kind: "node" | "edge", id: string) => void;
}

export const DiagramContext = createContext<DiagramContextValue>({
  status: { nodes: {}, edges: {} },
  mode: "view",
  reducedMotion: false,
  openDetail: () => undefined,
  openConfig: () => undefined,
});

export function useDiagramContext(): DiagramContextValue {
  return useContext(DiagramContext);
}

/** Honors prefers-reduced-motion for KPI edge animations. */
export function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
