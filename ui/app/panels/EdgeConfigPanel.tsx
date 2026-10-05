import React, { useState } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Accordion } from "@dynatrace/strato-components/content";
import { Menu, Tab, Tabs } from "@dynatrace/strato-components/navigation";
import { NumberInputV2, Select, Switch, TextInput, ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { DeleteIcon, DotMenuIcon } from "@dynatrace/strato-icons";
import { EdgeKpi, type DiagramEdge } from "../model/schema";
import type { Timeframe } from "../model/types";
import { DEFAULT_EDGE_KPI_DQL } from "../model/defaults";
import { assertSingleValue, numericColumns } from "../services/dql";
import { DqlField } from "./DqlField";
import { Field, InlineMessage } from "./Field";
import { IntegerInput } from "./IntegerInput";
import type { CommitMode } from "./NodeConfigPanel";
import { SidePanel } from "./SidePanel";
import { UnitField } from "./UnitField";

export interface EdgeDraft {
  type: DiagramEdge["type"];
  direction: DiagramEdge["direction"];
  label?: string;
  kpi?: DiagramEdge["kpi"];
}

/** Connection points: the handle (side) used on the source and on the target component. */
export interface EdgeEnds {
  sourceHandle?: string;
  targetHandle?: string;
}

export interface EdgeConfigPanelProps {
  edgeId: string;
  value: EdgeDraft;
  /** Read live from the canvas, so dragging an end of the connection updates the panel too. */
  ends: EdgeEnds;
  sourceName: string;
  targetName: string;
  timeframe: Timeframe;
  onChange: (id: string, draft: EdgeDraft, commit: CommitMode) => void;
  onEndsChange: (id: string, ends: EdgeEnds) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const FIRST_NUMERIC = "__first_numeric__";

const defaultKpi = (): NonNullable<DiagramEdge["kpi"]> => ({
  dql: DEFAULT_EDGE_KPI_DQL,
  unit: "count",
  decimals: 0,
  animated: true,
  // Low traffic is the usual concern for a request count; no limits until the user sets them.
  threshold: { direction: "below", warning: null, failing: null },
});

/** Side of a node where a connection starts or ends (handle ids of the nodes). */
const SIDES = [
  { id: "t", label: "↑ Top" },
  { id: "r", label: "→ Right" },
  { id: "b", label: "↓ Bottom" },
  { id: "l", label: "← Left" },
];

/**
 * Connection editor docked to the right of the canvas. Like the node editor, valid changes apply as you edit;
 * the parent mounts it with key={edgeId}.
 */
export function EdgeConfigPanel({
  edgeId,
  value,
  ends,
  sourceName,
  targetName,
  timeframe,
  onChange,
  onEndsChange,
  onDelete,
  onClose,
}: EdgeConfigPanelProps) {
  const [draft, setDraft] = useState<EdgeDraft>(() => structuredClone(value));
  const [columns, setColumns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const kpi = draft.kpi ?? defaultKpi();
  const t = kpi.threshold;
  const fieldOptions = Array.from(new Set([kpi.valueField, ...columns].filter((c): c is string => Boolean(c))));

  const update = (next: EdgeDraft, commit: CommitMode = "none") => {
    setDraft(next);
    if (next.type === "kpi") {
      const parsed = EdgeKpi.safeParse(next.kpi ?? defaultKpi());
      if (!parsed.success) {
        setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        return;
      }
      setError(null);
      onChange(edgeId, { ...next, kpi: parsed.data }, commit);
    } else {
      setError(null);
      onChange(edgeId, { type: "normal", direction: next.direction, label: next.label }, commit);
    }
  };
  const setKpi = (k: NonNullable<DiagramEdge["kpi"]>, commit: CommitMode = "none") => update({ ...draft, kpi: k }, commit);

  const sidePicker = (end: keyof EdgeEnds, label: string) => (
    <Flex flexDirection="column" gap={4}>
      <span style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>{label}</span>
      <ToggleButtonGroup value={ends[end] ?? ""} onChange={(v) => v && onEndsChange(edgeId, { ...ends, [end]: v })} aria-label={label}>
        {SIDES.map((side) => (
          <ToggleButtonGroup.Item key={side.id} value={side.id}>
            {side.label}
          </ToggleButtonGroup.Item>
        ))}
      </ToggleButtonGroup>
    </Flex>
  );

  const visualFields = (
    <Flex flexDirection="column" gap={12} paddingTop={12}>
      <Field
        label="Connection points"
        hint="Side of each component where the connection starts and ends. On the canvas you can also drag an end of the selected connection onto another dot."
      >
        <Flex flexDirection="column" gap={8}>
          {sidePicker("sourceHandle", `Starts at · ${sourceName}`)}
          {sidePicker("targetHandle", `Ends at · ${targetName}`)}
        </Flex>
      </Field>
      <Field label="Direction">
        <ToggleButtonGroup
          value={draft.direction}
          onChange={(v) => update({ ...draft, direction: v === "backward" ? "backward" : v === "none" ? "none" : "forward" })}
        >
          <ToggleButtonGroup.Item value="forward">→ source to target</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="backward">← target to source</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="none">— no arrow</ToggleButtonGroup.Item>
        </ToggleButtonGroup>
      </Field>
      <Field label="Label (optional)">
        <TextInput value={draft.label ?? ""} onChange={(v) => update({ ...draft, label: v || undefined })} />
      </Field>
      {draft.type === "kpi" && (
        <Switch value={kpi.animated} onChange={(checked) => setKpi({ ...kpi, animated: checked })}>
          Animate (dots flow in the arrow's direction)
        </Switch>
      )}
    </Flex>
  );

  return (
    <SidePanel
      title={draft.label || (draft.type === "kpi" ? "KPI connection" : "Connection")}
      subtitle={draft.type === "kpi" ? "KPI relation" : "Normal"}
      onClose={onClose}
      actions={
        <Menu>
          <Menu.Trigger>
            <Button aria-label="More actions" size="condensed">
              <Button.Prefix>
                <DotMenuIcon />
              </Button.Prefix>
            </Button>
          </Menu.Trigger>
          <Menu.Content>
            <Menu.Item onSelect={() => onDelete(edgeId)}>
              <Menu.Prefix>
                <DeleteIcon />
              </Menu.Prefix>
              Delete connection
            </Menu.Item>
          </Menu.Content>
        </Menu>
      }
    >
      <Flex flexDirection="column" gap={8}>
        {error && <InlineMessage kind="error">{error}</InlineMessage>}
        <Field label="Connection type">
          <ToggleButtonGroup
            value={draft.type}
            onChange={(v) => update({ ...draft, type: v === "kpi" ? "kpi" : "normal", kpi: v === "kpi" ? kpi : draft.kpi }, "now")}
          >
            <ToggleButtonGroup.Item value="normal">Normal</ToggleButtonGroup.Item>
            <ToggleButtonGroup.Item value="kpi">KPI relation</ToggleButtonGroup.Item>
          </ToggleButtonGroup>
        </Field>

        {draft.type === "kpi" ? (
          <Tabs key="kpi">
            <Tab title="Data">
              <Accordion multiple defaultExpanded={["dql", "value"]}>
                <Accordion.Section id="dql">
                  <Accordion.SectionLabel>DQL</Accordion.SectionLabel>
                  <Accordion.SectionContent>
                    <DqlField
                      label="DQL (must return a single value)"
                      hint="Uses the first row and the selected column (or the first numeric one). Run applies the query to the diagram."
                      value={kpi.dql}
                      onChange={(v) => setKpi({ ...kpi, dql: v })}
                      onRun={() => setKpi(kpi, "now")}
                      timeframe={timeframe}
                      validate={(r) => {
                        const single = assertSingleValue(r, kpi.valueField);
                        return single.ok ? null : single.error;
                      }}
                      onResult={(r) => setColumns(r ? numericColumns(r) : [])}
                    />
                  </Accordion.SectionContent>
                </Accordion.Section>
                <Accordion.Section id="value">
                  <Accordion.SectionLabel>Value</Accordion.SectionLabel>
                  <Accordion.SectionContent>
                    <Flex flexDirection="column" gap={12}>
                      <Field label="Value column">
                        <Select
                          value={kpi.valueField ?? FIRST_NUMERIC}
                          onChange={(v) => setKpi({ ...kpi, valueField: !v || v === FIRST_NUMERIC ? undefined : v }, "debounced")}
                        >
                          <Select.Content>
                            <Select.Option value={FIRST_NUMERIC}>First numeric column</Select.Option>
                            {fieldOptions.map((c) => (
                              <Select.Option key={c} value={c}>
                                {c}
                              </Select.Option>
                            ))}
                          </Select.Content>
                        </Select>
                      </Field>
                      <Flex gap={12}>
                        <div style={{ flex: 1 }}>
                          <UnitField value={kpi.unit} onChange={(unit) => setKpi({ ...kpi, unit })} />
                        </div>
                        <Field label="Decimals">
                          <IntegerInput value={kpi.decimals} min={0} max={10} aria-label="Decimals" onChange={(decimals) => setKpi({ ...kpi, decimals })} />
                        </Field>
                      </Flex>
                    </Flex>
                  </Accordion.SectionContent>
                </Accordion.Section>
              </Accordion>
            </Tab>
            <Tab title="Threshold">
              <Flex flexDirection="column" gap={12} paddingTop={12}>
                <Field label="Threshold direction">
                  <Select value={t.direction} onChange={(v) => v && setKpi({ ...kpi, threshold: { ...t, direction: v } }, "debounced")}>
                    <Select.Content>
                      <Select.Option value="above">above: bad when the value is higher</Select.Option>
                      <Select.Option value="below">below: bad when the value is lower</Select.Option>
                    </Select.Content>
                  </Select>
                </Field>
                <Flex gap={12}>
                  <Field label="Warning">
                    <NumberInputV2 value={t.warning} onChange={(v) => setKpi({ ...kpi, threshold: { ...t, warning: v } }, "debounced")} />
                  </Field>
                  <Field label="Failing">
                    <NumberInputV2 value={t.failing} onChange={(v) => setKpi({ ...kpi, threshold: { ...t, failing: v } }, "debounced")} />
                  </Field>
                </Flex>
              </Flex>
            </Tab>
            <Tab title="Visual">
              {visualFields}
            </Tab>
          </Tabs>
        ) : (
          <Tabs key="normal">
            <Tab title="Visual">
              {visualFields}
            </Tab>
          </Tabs>
        )}
      </Flex>
    </SidePanel>
  );
}
