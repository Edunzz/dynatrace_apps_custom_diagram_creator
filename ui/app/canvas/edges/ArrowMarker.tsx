import React from "react";

/**
 * Per-edge arrow marker: lets the color be a Strato token (CSS variable)
 * applied via style, and keeps the marker id safe inside url(#...).
 */
export function ArrowMarker({ id, color, start = false }: { id: string; color: string; start?: boolean }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX={9}
      refY={5}
      markerWidth={12}
      markerHeight={12}
      markerUnits="userSpaceOnUse"
      orient={start ? "auto-start-reverse" : "auto"}
    >
      <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: color }} />
    </marker>
  );
}

export function safeSvgId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}
