import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { NumberInputV2, Switch, TextInput } from "@dynatrace/strato-components/forms";
import type { KpiBlock } from "../model/schema";
import type { Timeframe } from "../model/types";
import { DEFAULT_KPI_BLOCK } from "../model/defaults";
import { assertTable } from "../services/dql";
import { DqlField } from "./DqlField";
import { Field } from "./Field";
import type { CommitMode } from "./NodeConfigPanel";

/** Optional KPI block section, shared by every node form. */
export function KpiBlockEditor({
  value,
  onChange,
  timeframe,
}: {
  value: KpiBlock | undefined;
  onChange: (kpi: KpiBlock | undefined, commit?: CommitMode) => void;
  timeframe: Timeframe;
}) {
  const enabled = value?.enabled ?? false;
  const kpi = value ?? { ...DEFAULT_KPI_BLOCK, enabled: false };
  return (
    <Flex flexDirection="column" gap={12} paddingTop={12}>
      <Switch value={enabled} onChange={(checked) => onChange({ ...kpi, enabled: checked }, "now")}>
        Añadir KPIs bajo el nodo
      </Switch>
      {enabled && (
        <>
          <Field label="Título">
            <TextInput value={kpi.title} onChange={(v) => onChange({ ...kpi, title: v })} />
          </Field>
          <Field label="Máximo de filas">
            <NumberInputV2 value={kpi.maxRows} min={1} max={50} onChange={(v) => onChange({ ...kpi, maxRows: Math.max(1, v ?? 5) })} />
          </Field>
          <DqlField
            label="DQL (debe devolver una tabla)"
            value={kpi.dql}
            onChange={(v) => onChange({ ...kpi, dql: v })}
            onRun={() => onChange(kpi, "now")}
            timeframe={timeframe}
            validate={assertTable}
          />
        </>
      )}
    </Flex>
  );
}
