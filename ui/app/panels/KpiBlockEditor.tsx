import React, { useState } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Select, Switch, TextInput, ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import { DeleteIcon, PlusIcon } from "@dynatrace/strato-icons";
import type { KpiBlock, KpiItem } from "../model/schema";
import type { DqlResult, Timeframe } from "../model/types";
import { numericColumns } from "../services/dql";
import { kpiItems, labelColumns, newKpiItem } from "../services/kpi";
import { DqlField } from "./DqlField";
import { Field, InlineMessage } from "./Field";
import { IntegerInput } from "./IntegerInput";
import type { CommitMode } from "./NodeConfigPanel";
import { UnitField } from "./UnitField";

const FIRST = "__first__";

interface Columns {
  numeric: string[];
  labels: string[];
}

function KpiItemEditor({
  item,
  index,
  columns,
  timeframe,
  onChange,
  onRemove,
  onColumns,
}: {
  item: KpiItem;
  index: number;
  columns?: Columns;
  timeframe: Timeframe;
  onChange: (item: KpiItem, commit?: CommitMode) => void;
  onRemove: () => void;
  onColumns: (result: DqlResult | null) => void;
}) {
  const valueOptions = Array.from(new Set([item.valueField, ...(columns?.numeric ?? [])].filter((c): c is string => Boolean(c))));
  const labelOptions = Array.from(new Set([item.labelField, ...(columns?.labels ?? [])].filter((c): c is string => Boolean(c))));
  return (
    <div
      style={{
        border: `1px solid ${Colors.Border.Neutral.Default}`,
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <Flex alignItems="center" justifyContent="space-between">
        <strong style={{ fontSize: 13 }}>
          KPI {index + 1}
          {item.labelMode === "text" && item.labelText ? ` · ${item.labelText}` : ""}
        </strong>
        <Tooltip text="Remove this KPI">
          <Button aria-label="Remove this KPI" size="condensed" color="critical" onClick={onRemove}>
            <Button.Prefix>
              <DeleteIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
      </Flex>
      <DqlField
        label="Query"
        hint="Any DQL that returns a numeric column. Run it to load its columns into the selectors below."
        value={item.dql}
        onChange={(v) => onChange({ ...item, dql: v })}
        onRun={() => onChange(item, "now")}
        onResult={onColumns}
        timeframe={timeframe}
        validate={(r) => (numericColumns(r).length > 0 ? null : "The query returns no numeric column for the value.")}
      />
      <Field label="Value" hint="Column of the result that holds the number to show.">
        <Select
          value={item.valueField ?? FIRST}
          onChange={(v) => onChange({ ...item, valueField: !v || v === FIRST ? undefined : v }, "debounced")}
        >
          <Select.Content>
            <Select.Option value={FIRST}>First numeric column</Select.Option>
            {valueOptions.map((c) => (
              <Select.Option key={c} value={c}>
                {c}
              </Select.Option>
            ))}
          </Select.Content>
        </Select>
      </Field>
      <Field
        label="Name"
        hint={
          item.labelMode === "text"
            ? "A fixed name; the KPI shows the value of the first row."
            : "Read the name from a column; the KPI shows one line per result row."
        }
      >
        <Flex flexDirection="column" gap={6}>
          <ToggleButtonGroup
            value={item.labelMode}
            onChange={(v) => onChange({ ...item, labelMode: v === "column" ? "column" : "text" }, "debounced")}
          >
            <ToggleButtonGroup.Item value="text">Custom text</ToggleButtonGroup.Item>
            <ToggleButtonGroup.Item value="column">From a column</ToggleButtonGroup.Item>
          </ToggleButtonGroup>
          {item.labelMode === "text" ? (
            <TextInput
              value={item.labelText ?? ""}
              onChange={(v) => onChange({ ...item, labelText: v || undefined }, "debounced")}
              placeholder="e.g. Response time"
              aria-label="KPI name"
            />
          ) : (
            <Select
              value={item.labelField ?? FIRST}
              onChange={(v) => onChange({ ...item, labelField: !v || v === FIRST ? undefined : v }, "debounced")}
              aria-label="Name column"
            >
              <Select.Content>
                <Select.Option value={FIRST}>First text column</Select.Option>
                {labelOptions.map((c) => (
                  <Select.Option key={c} value={c}>
                    {c}
                  </Select.Option>
                ))}
              </Select.Content>
            </Select>
          )}
        </Flex>
      </Field>
      {item.labelMode === "column" && (
        <Field label="Lines to show" hint="How many result rows the KPI lists under the node, from the top (1–50).">
          <div style={{ width: 110 }}>
            <IntegerInput
              value={item.maxRows}
              min={1}
              max={50}
              aria-label="Lines to show"
              onChange={(maxRows) => onChange({ ...item, maxRows }, "debounced")}
            />
          </div>
        </Field>
      )}
      <Flex gap={12}>
        <div style={{ flex: 1 }}>
          <UnitField value={item.unit} onChange={(unit) => onChange({ ...item, unit })} />
        </div>
        <div style={{ width: 110 }}>
          <Field label="Decimals">
            <IntegerInput value={item.decimals} min={0} max={10} aria-label="Decimals" onChange={(decimals) => onChange({ ...item, decimals })} />
          </Field>
        </div>
      </Flex>
    </div>
  );
}

/** KPI section shared by every node form: a list of KPIs shown under the node. */
export function KpiBlockEditor({
  value,
  onChange,
  timeframe,
}: {
  value: KpiBlock | undefined;
  onChange: (kpi: KpiBlock | undefined, commit?: CommitMode) => void;
  timeframe: Timeframe;
}) {
  const [columns, setColumns] = useState<Record<string, Columns>>({});
  const enabled = value?.enabled ?? false;
  const title = value?.title ?? "KPIs";
  // A legacy block (one query shown as a table) appears here as one KPI; saving writes the new format.
  const items = kpiItems(value);

  const emit = (next: KpiItem[], commit?: CommitMode, overrides: Partial<KpiBlock> = {}) =>
    onChange({ enabled, title, items: next, ...overrides }, commit);

  const update = (index: number, item: KpiItem, commit?: CommitMode) => emit(items.map((it, i) => (i === index ? item : it)), commit);

  const add = () => emit([...items, newKpiItem(`k-${crypto.randomUUID().slice(0, 8)}`)], "now");

  return (
    <Flex flexDirection="column" gap={12} paddingTop={12}>
      <Switch
        value={enabled}
        onChange={(checked) =>
          emit(items.length ? items : [newKpiItem(`k-${crypto.randomUUID().slice(0, 8)}`)], "now", { enabled: checked })
        }
      >
        Show KPIs under the node
      </Switch>
      {enabled && (
        <>
          <Field label="Title" hint="Heading shown above the KPI lines.">
            <TextInput value={title} onChange={(v) => emit(items, "none", { title: v })} />
          </Field>
          {items.length === 0 && <InlineMessage kind="info">No KPIs yet. Add one below.</InlineMessage>}
          {items.map((item, index) => (
            <KpiItemEditor
              key={item.id}
              item={item}
              index={index}
              columns={columns[item.id]}
              timeframe={timeframe}
              onChange={(next, commit) => update(index, next, commit)}
              onRemove={() => emit(items.filter((_, i) => i !== index), "now")}
              onColumns={(r) =>
                setColumns((prev) => ({ ...prev, [item.id]: r ? { numeric: numericColumns(r), labels: labelColumns(r) } : { numeric: [], labels: [] } }))
              }
            />
          ))}
          <div>
            <Button onClick={add}>
              <Button.Prefix>
                <PlusIcon />
              </Button.Prefix>
              Add KPI
            </Button>
          </div>
        </>
      )}
    </Flex>
  );
}
