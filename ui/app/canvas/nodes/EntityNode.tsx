import React, { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import type { Status } from "../../model/types";
import { COMPONENT_LABELS } from "../../model/defaults";
import { resolveIcon } from "../../services/icons";
import { useDiagramContext } from "../DiagramContext";
import { ENTITY_NODE_WIDTH, type EntityFlowNode } from "../flowTypes";
import { STATUS_BG, STATUS_COLOR, STATUS_LABEL, StatusGlyph } from "../statusStyle";
import { NodeHandles } from "./Handles";
import { KpiBlock } from "./KpiBlock";

function EntityNodeComponent({ id, data, selected }: NodeProps<EntityFlowNode>) {
  const { status, mode } = useDiagramContext();
  const nodeStatus = status.nodes[id];
  const s: Status = nodeStatus?.status ?? "loading";
  const Icon = resolveIcon(data.icon);
  const problems = nodeStatus?.activeProblems;
  const entities = nodeStatus?.entityIds?.length;
  const tooltip = nodeStatus?.error ? `${STATUS_LABEL[s]}: ${nodeStatus.error}` : STATUS_LABEL[s];

  return (
    <div
      className={`cdc-node cdc-clickable${selected ? " cdc-selected" : ""}`}
      style={{
        width: ENTITY_NODE_WIDTH,
        padding: "8px 10px",
        background: STATUS_BG[s],
        borderColor: STATUS_COLOR[s],
      }}
    >
      <NodeHandles connectable={mode === "edit"} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size="default" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={data.name}
          >
            {data.name}
          </div>
          <div style={{ fontSize: 11, color: Colors.Text.Neutral.Subdued }}>
            {COMPONENT_LABELS[data.componentType]}
            {entities !== undefined ? ` · ${entities} id${entities === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <Tooltip text={tooltip}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {problems !== undefined && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: problems > 0 ? STATUS_COLOR[s] : Colors.Text.Neutral.Subdued,
                  fontVariantNumeric: "tabular-nums",
                }}
                aria-label={`${problems} problems activos`}
              >
                {problems}
              </span>
            )}
            <StatusGlyph status={s} />
          </span>
        </Tooltip>
      </div>
      {data.kpi?.enabled && <KpiBlock config={data.kpi} state={nodeStatus?.kpi} />}
    </div>
  );
}

export const EntityNode = memo(EntityNodeComponent);
