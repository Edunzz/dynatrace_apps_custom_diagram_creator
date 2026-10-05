import React from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import type { KpiBlock as KpiBlockConfig } from "../../model/schema";
import type { KpiState } from "../../model/types";
import { formatNumber } from "../../services/dql";
import { kpiItems } from "../../services/kpi";
import { withUnit } from "../../services/units";

/** KPI list visually attached to the bottom of a node: one "label · value unit" line per KPI result. */
export function KpiBlock({ config, state }: { config: KpiBlockConfig; state?: KpiState }) {
  const items = kpiItems(config);
  return (
    <div
      className="nodrag"
      style={{
        marginTop: 6,
        paddingTop: 6,
        borderTop: `1px dashed ${Colors.Border.Neutral.Default}`,
        cursor: "default",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: Colors.Text.Neutral.Subdued, marginBottom: 2 }}>
        {config.title}
      </div>
      {!state ? (
        <ProgressCircle size="small" aria-label="Loading KPIs" />
      ) : (
        <div className="cdc-kpi-list">
          {items.map((item) => {
            const result = state.items.find((r) => r.id === item.id);
            if (!result) {
              return null;
            }
            if (result.status === "error") {
              return (
                <div key={item.id} className="cdc-kpi-error" title={result.error}>
                  {item.labelMode === "text" && item.labelText ? `${item.labelText}: ` : ""}
                  {result.error}
                </div>
              );
            }
            if (result.lines.length === 0) {
              return (
                <div key={item.id} className="cdc-kpi-line">
                  <span className="cdc-kpi-label">{item.labelText || "KPI"}</span>
                  <span className="cdc-kpi-value">—</span>
                </div>
              );
            }
            return result.lines.map((line, i) => {
              const text = line.value === null ? "—" : withUnit(formatNumber(line.value, item.decimals), item.unit);
              return (
                <div key={`${item.id}-${i}`} className="cdc-kpi-line" title={`${line.label}: ${text}`}>
                  <span className="cdc-kpi-label">{line.label}</span>
                  <span className="cdc-kpi-value">{text}</span>
                </div>
              );
            });
          })}
        </div>
      )}
    </div>
  );
}
