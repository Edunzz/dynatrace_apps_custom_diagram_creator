import React from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import type { KpiBlock as KpiBlockConfig } from "../../model/schema";
import type { KpiTableState } from "../../model/types";
import { ResultTable } from "./ResultTable";

/** KPI table visually attached to the bottom of a node. */
export function KpiBlock({ config, state }: { config: KpiBlockConfig; state?: KpiTableState }) {
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
      {!state || state.status === "loading" ? (
        <ProgressCircle size="small" aria-label="Cargando KPIs" />
      ) : state.status === "error" ? (
        <div style={{ fontSize: 11, color: Colors.Text.Critical.Default, whiteSpace: "normal" }}>{state.error}</div>
      ) : state.result ? (
        <div style={{ overflowX: "auto" }}>
          <ResultTable result={state.result} maxRows={config.maxRows} />
        </div>
      ) : null}
    </div>
  );
}
