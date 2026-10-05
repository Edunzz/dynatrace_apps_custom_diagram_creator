import React, { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import type { Status } from "../../model/types";
import { formatNumber } from "../../services/dql";
import { withUnit } from "../../services/units";
import { useDiagramContext } from "../DiagramContext";
import type { FlowEdge } from "../flowTypes";
import { STATUS_COLOR, STATUS_LABEL, StatusGlyph } from "../statusStyle";
import { ArrowMarker, safeSvgId } from "./ArrowMarker";
import { EdgeChrome } from "./EdgeChrome";

const DOT_OFFSETS = ["0s", "0.66s", "1.33s"];

function KpiEdgeComponent({
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
  const { status, reducedMotion, mode, openDetail, openConfig, editingId } = useDiagramContext();
  const editing = editingId === id;
  const edgeStatus = status.edges[id];
  const s: Status = edgeStatus?.status ?? "loading";
  const color = STATUS_COLOR[s];
  const kpi = data?.kpi;
  const direction = data?.direction ?? "forward";

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
  });
  // For "<-" the dots travel the reversed path (target to source).
  const motionPath =
    direction === "backward"
      ? getSmoothStepPath({
          sourceX: targetX,
          sourceY: targetY,
          sourcePosition: targetPosition,
          targetX: sourceX,
          targetY: sourceY,
          targetPosition: sourcePosition,
          borderRadius: 10,
        })[0]
      : path;

  const sid = safeSvgId(id);
  const animate = Boolean(kpi?.animated) && !reducedMotion && (s === "pass" || s === "warning" || s === "failing");
  const valueText =
    edgeStatus?.value !== undefined
      ? withUnit(formatNumber(edgeStatus.value, kpi?.decimals ?? 2), kpi?.unit)
      : s === "loading"
        ? "…"
        : "n/a";
  const title = edgeStatus?.error ? `${STATUS_LABEL[s]}: ${edgeStatus.error}` : `${STATUS_LABEL[s]} · ${valueText}`;

  return (
    <>
      <defs>
        {direction === "forward" && <ArrowMarker id={`cdc-kend-${sid}`} color={color} />}
        {direction === "backward" && <ArrowMarker id={`cdc-kstart-${sid}`} color={color} start />}
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={direction === "forward" ? `url(#cdc-kend-${sid})` : undefined}
        markerStart={direction === "backward" ? `url(#cdc-kstart-${sid})` : undefined}
        style={{ stroke: color, strokeWidth: editing ? 4.5 : selected ? 3.5 : 2.5 }}
      />
      {animate &&
        DOT_OFFSETS.map((begin) => (
          <circle key={begin} r={4} style={{ fill: color }} pointerEvents="none">
            <animateMotion dur="2s" begin={begin} repeatCount="indefinite" path={motionPath} />
          </circle>
        ))}
      <EdgeChrome id={id} selected={Boolean(selected)} x={labelX} y={data?.label ? labelY - 24 : labelY} />
      <EdgeLabelRenderer>
        <div
          className="cdc-pill nodrag nopan cdc-clickable"
          title={title}
          role="button"
          tabIndex={0}
          onClick={() => (mode === "view" ? openDetail("edge", id) : undefined)}
          onDoubleClick={() => (mode === "edit" ? openConfig("edge", id) : undefined)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (mode === "view") {
                openDetail("edge", id);
              } else {
                openConfig("edge", id);
              }
            }
          }}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            borderColor: color,
            color: s === "unknown" || s === "loading" ? Colors.Text.Neutral.Subdued : Colors.Text.Neutral.Default,
            display: "flex",
            alignItems: "center",
            gap: 4,
            outline: selected || editing ? `${editing ? 3 : 2}px solid ${Colors.Border.Primary.Accent}` : undefined,
          }}
        >
          <StatusGlyph status={s} />
          <span>{valueText}</span>
        </div>
        {data?.label && (
          <div
            className="cdc-edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 24}px)` }}
          >
            {data.label}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export const KpiEdge = memo(KpiEdgeComponent);
