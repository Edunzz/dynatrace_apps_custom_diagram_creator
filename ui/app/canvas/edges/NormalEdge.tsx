import React, { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useDiagramContext } from "../DiagramContext";
import type { FlowEdge } from "../flowTypes";
import { ArrowMarker, safeSvgId } from "./ArrowMarker";
import { EdgeChrome } from "./EdgeChrome";

function NormalEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<FlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
  });
  const { editingId } = useDiagramContext();
  const editing = editingId === id;
  const color = selected || editing ? Colors.Border.Primary.Accent : Colors.Border.Neutral.Accent;
  const direction = data?.direction ?? "forward";
  const sid = safeSvgId(id);
  return (
    <>
      <defs>
        {direction === "forward" && <ArrowMarker id={`cdc-end-${sid}`} color={color} />}
        {direction === "backward" && <ArrowMarker id={`cdc-start-${sid}`} color={color} start />}
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={direction === "forward" ? `url(#cdc-end-${sid})` : undefined}
        markerStart={direction === "backward" ? `url(#cdc-start-${sid})` : undefined}
        style={{ stroke: color, strokeWidth: editing ? 3.5 : selected ? 2.5 : 1.5 }}
      />
      <EdgeChrome id={id} selected={Boolean(selected)} x={labelX} y={labelY} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="cdc-edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const NormalEdge = memo(NormalEdgeComponent);
