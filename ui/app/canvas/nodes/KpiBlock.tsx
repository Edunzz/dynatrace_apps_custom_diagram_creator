import React from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import type { KpiBlock as KpiBlockConfig } from "../../model/schema";
import type { KpiState } from "../../model/types";
import { formatNumber } from "../../services/dql";
import { kpiItems, kpiTitle } from "../../services/kpi";
import { withUnit } from "../../services/units";

/**
 * KPI list visually attached to the bottom of a node. A KPI with one line per entity shows its title above its
 * lines, so several KPIs over the same entities stay readable; with a single line, the line carries the title.
 */
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
            const title = kpiTitle(item);
            if (result.status === "error") {
              return (
                <div key={item.id} className="cdc-kpi-error" title={result.error}>
                  {title ? `${title}: ` : ""}
                  {result.error}
                </div>
              );
            }
            if (result.lines.length === 0) {
              return (
                <div key={item.id} className="cdc-kpi-line">
                  <span className="cdc-kpi-label">{title ?? "KPI"}</span>
                  <span className="cdc-kpi-value">—</span>
                </div>
              );
            }
            const format = (value: number | null) => (value === null ? "—" : withUnit(formatNumber(value, item.decimals), item.unit));
            const grouped = item.labelMode === "column" && Boolean(title);
            if (grouped && result.lines.length === 1) {
              const [line] = result.lines;
              return (
                <div key={item.id} className="cdc-kpi-line" title={`${title} · ${line.label}: ${format(line.value)}`}>
                  <span className="cdc-kpi-label">{title}</span>
                  <span className="cdc-kpi-value">{format(line.value)}</span>
                </div>
              );
            }
            const lines = result.lines.map((line, i) => (
              <div
                key={`${item.id}-${i}`}
                className={`cdc-kpi-line${grouped ? " cdc-kpi-sub" : ""}`}
                title={`${grouped ? `${title} · ` : ""}${line.label}: ${format(line.value)}`}
              >
                <span className="cdc-kpi-label">{line.label}</span>
                <span className="cdc-kpi-value">{format(line.value)}</span>
              </div>
            ));
            return grouped ? (
              <div key={item.id} className="cdc-kpi-group">
                <div className="cdc-kpi-heading">{title}</div>
                {lines}
              </div>
            ) : (
              lines
            );
          })}
        </div>
      )}
    </div>
  );
}
