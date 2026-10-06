import React, { useState } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Select, Switch, TextInput, ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import { DeleteIcon, PlusIcon } from "@dynatrace/strato-icons";
import { Menu } from "@dynatrace/strato-components/navigation";
import type { ComponentType, KpiBlock, KpiItem } from "../model/schema";
import { COMPONENT_LABELS } from "../model/defaults";
import { findPreset, kpiPresetsFor, type KpiPreset } from "../model/kpiPresets";
import type { DqlResult, Timeframe } from "../model/types";
import { numericColumns } from "../services/dql";
import { kpiItems, kpiTitle, labelColumns, newKpiItem } from "../services/kpi";
import { expandScope, usesScope, type EntityScope } from "../services/kpiScope";
import { DqlField } from "./DqlField";
import { Field, InlineMessage } from "./Field";
import { IntegerInput } from "./IntegerInput";
import type { CommitMode } from "./NodeConfigPanel";
import { UnitField } from "./UnitField";

const FIRST = "__first__";

const newKpiId = () => `k-${crypto.randomUUID().slice(0, 8)}`;

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
  prepare,
}: {
  item: KpiItem;
  index: number;
  columns?: Columns;
  timeframe: Timeframe;
  onChange: (item: KpiItem, commit?: CommitMode) => void;
  onRemove: () => void;
  onColumns: (result: DqlResult | null) => void;
  prepare: (dql: string) => Promise<string>;
}) {
  const preset = findPreset(item.preset);
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
        <Flex alignItems="center" gap={6}>
          <strong style={{ fontSize: 13 }}>
            KPI {index + 1}
            {kpiTitle(item) ? ` · ${kpiTitle(item)}` : ""}
          </strong>
          {preset && (
            <Tooltip text="Ready-made KPI for the entities picked on the Data tab. Editing its query makes it a custom KPI.">
              <span className="cdc-preset-badge">Ready-made</span>
            </Tooltip>
          )}
        </Flex>
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
        hint={
          usesScope(item.dql)
            ? "$entityIds stands for the entities picked on the Data tab: the query shows one line per entity. Run it to preview."
            : "Any DQL that returns a numeric column. Run it to load its columns into the selectors below."
        }
        value={item.dql}
        prepare={prepare}
        onChange={(v) => onChange({ ...item, dql: v, preset: undefined })}
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
            : "One line per result row, named from this column, under the KPI title."
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
            <>
              <TextInput
                value={item.title ?? ""}
                onChange={(v) => onChange({ ...item, title: v || undefined })}
                placeholder={preset?.label ?? "KPI title, e.g. Response time"}
                aria-label="KPI title"
              />
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
            </>
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
  componentType,
  resolveScope,
}: {
  value: KpiBlock | undefined;
  onChange: (kpi: KpiBlock | undefined, commit?: CommitMode) => void;
  timeframe: Timeframe;
  /** Entity components: the type's ready-made KPIs are offered in "Add KPI". */
  componentType?: ComponentType;
  /** Entity components: the picked entities, to preview queries that use $entityIds. */
  resolveScope?: () => Promise<EntityScope>;
}) {
  const presets: KpiPreset[] = componentType ? kpiPresetsFor(componentType) : [];
  const prepare = async (dql: string) => (usesScope(dql) ? expandScope(dql, resolveScope ? await resolveScope() : undefined) : dql);
  const [columns, setColumns] = useState<Record<string, Columns>>({});
  const enabled = value?.enabled ?? false;
  const title = value?.title ?? "KPIs";
  // A legacy block (one query shown as a table) appears here as one KPI; saving writes the new format.
  const items = kpiItems(value);

  const emit = (next: KpiItem[], commit?: CommitMode, overrides: Partial<KpiBlock> = {}) =>
    onChange({ enabled, title, items: next, ...overrides }, commit);

  const update = (index: number, item: KpiItem, commit?: CommitMode) => emit(items.map((it, i) => (i === index ? item : it)), commit);

  const add = () => emit([...items, newKpiItem(newKpiId())], "now");
  const addPreset = (preset: KpiPreset) => emit([...items, { ...preset.item, id: newKpiId() }], "now");
  // Turning the block on for an empty component starts with the type's default ready-made KPIs.
  const starters = () => {
    const defaults = presets.filter((p) => p.isDefault).map((p) => ({ ...p.item, id: newKpiId() }));
    return defaults.length ? defaults : [newKpiItem(newKpiId())];
  };

  return (
    <Flex flexDirection="column" gap={12} paddingTop={12}>
      <Switch
        value={enabled}
        onChange={(checked) =>
          emit(items.length ? items : starters(), "now", { enabled: checked })
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
              prepare={prepare}
              onColumns={(r) =>
                setColumns((prev) => ({ ...prev, [item.id]: r ? { numeric: numericColumns(r), labels: labelColumns(r) } : { numeric: [], labels: [] } }))
              }
            />
          ))}
          <div>
            {presets.length > 0 && componentType ? (
              <Menu>
                <Menu.Trigger>
                  <Button>
                    <Button.Prefix>
                      <PlusIcon />
                    </Button.Prefix>
                    Add KPI
                  </Button>
                </Menu.Trigger>
                <Menu.Content>
                  <Menu.Group>
                    <Menu.Label>Ready-made for {COMPONENT_LABELS[componentType]} · one line per picked entity</Menu.Label>
                    {presets.map((p) => (
                      <Menu.Item
                        key={p.key}
                        textValue={p.label}
                        disabled={items.some((it) => it.preset === p.key)}
                        onSelect={() => addPreset(p)}
                      >
                        <span style={{ display: "flex", flexDirection: "column" }}>
                          <span>{p.label}</span>
                          <span style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>{p.description}</span>
                        </span>
                      </Menu.Item>
                    ))}
                  </Menu.Group>
                  <Menu.Group>
                    <Menu.Item textValue="Custom KPI" onSelect={add}>
                      <span style={{ display: "flex", flexDirection: "column" }}>
                        <span>Custom KPI</span>
                        <span style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>Your own DQL query</span>
                      </span>
                    </Menu.Item>
                  </Menu.Group>
                </Menu.Content>
              </Menu>
            ) : (
              <Button onClick={add}>
                <Button.Prefix>
                  <PlusIcon />
                </Button.Prefix>
                Add KPI
              </Button>
            )}
          </div>
        </>
      )}
    </Flex>
  );
}
