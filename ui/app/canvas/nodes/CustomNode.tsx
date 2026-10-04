import React, { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import type { Status, SubStatus } from "../../model/types";
import { formatNumber } from "../../services/dql";
import { resolveIcon } from "../../services/icons";
import { useDiagramContext } from "../DiagramContext";
import type { CustomFlowNode } from "../flowTypes";
import { STATUS_BG, STATUS_COLOR, STATUS_LABEL, StatusDot, StatusGlyph } from "../statusStyle";
import { NodeHandles } from "./Handles";
import { KpiBlock } from "./KpiBlock";
import { NodeChrome } from "./NodeChrome";

const ROW_HEIGHT = 24;

function SubRow({ child, mode }: { child: SubStatus; mode: "entities" | "slos" }) {
  const detail =
    mode === "slos"
      ? [
          child.value !== undefined ? `${formatNumber(child.value, 2)} %` : null,
          child.errorBudget !== undefined ? `EB ${formatNumber(child.errorBudget, 1)} %` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : child.problems
        ? `${child.problems} problem${child.problems === 1 ? "" : "s"}`
        : "";
  const tooltip = child.message ? `${STATUS_LABEL[child.status]}: ${child.message}` : STATUS_LABEL[child.status];
  return (
    <Tooltip text={tooltip}>
      <div className="cdc-row" style={{ height: ROW_HEIGHT, boxSizing: "border-box" }}>
        <StatusDot status={child.status} />
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {child.name}
        </span>
        {detail && (
          <span style={{ fontSize: 11, color: Colors.Text.Neutral.Subdued, fontVariantNumeric: "tabular-nums" }}>
            {detail}
          </span>
        )}
        <StatusGlyph status={child.status} />
      </div>
    </Tooltip>
  );
}

function CustomNodeComponent({ id, data, selected }: NodeProps<CustomFlowNode>) {
  const { status, mode } = useDiagramContext();
  const nodeStatus = status.nodes[id];
  const s: Status = nodeStatus?.status ?? "loading";
  const Icon = resolveIcon(data.icon);
  const children = nodeStatus?.children ?? [];
  const single = data.mode === "entities" && children.length === 1 ? children[0] : undefined;
  const tooltip = nodeStatus?.error ? `${STATUS_LABEL[s]}: ${nodeStatus.error}` : STATUS_LABEL[s];
  const maxVisible = data.maxVisibleRows ?? 8;

  return (
    <div
      className={`cdc-node cdc-clickable${selected ? " cdc-selected" : ""}`}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 200,
        minHeight: 100,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: single ? STATUS_BG[s] : Colors.Background.Surface.Default,
        borderColor: STATUS_COLOR[s],
        borderWidth: 2,
        borderLeftWidth: 6,
      }}
    >
      <NodeChrome id={id} selected={selected} minWidth={200} minHeight={100} />
      <NodeHandles connectable={mode === "edit"} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size="default" style={{ flexShrink: 0 }} />
        <div
          style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={data.name}
        >
          {data.name}
        </div>
        <Tooltip text={tooltip}>
          <span style={{ display: "inline-flex" }}>
            <StatusGlyph status={s} />
          </span>
        </Tooltip>
      </div>

      {single ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            textAlign: "center",
            padding: 8,
          }}
        >
          <StatusGlyph status={single.status} size="default" />
          <span>{single.name}</span>
        </div>
      ) : children.length > 0 ? (
        <div className="cdc-rows nodrag nowheel" style={{ flex: 1, maxHeight: maxVisible * ROW_HEIGHT + 4 }}>
          {children.map((child) => (
            <SubRow key={child.key} child={child} mode={data.mode} />
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, fontSize: 12, color: Colors.Text.Neutral.Subdued, whiteSpace: "normal" }}>
          {s === "loading" ? "Loading…" : nodeStatus?.error ?? "No items"}
        </div>
      )}

      {data.kpi?.enabled && <KpiBlock config={data.kpi} state={nodeStatus?.kpi} />}
    </div>
  );
}

export const CustomNode = memo(CustomNodeComponent);
