import React, { useEffect, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Accordion } from "@dynatrace/strato-components/content";
import { Menu, Tab, Tabs } from "@dynatrace/strato-components/navigation";
import { NumberInputV2, Select, TextInput, ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { DeleteIcon, DotMenuIcon } from "@dynatrace/strato-icons";
import {
  NodeData,
  type ComponentType,
  type CustomNodeData,
  type EntityNodeData,
  type NodeData as NodeDataType,
} from "../model/schema";
import type { DqlResult, Timeframe } from "../model/types";
import { COMPONENT_LABELS, COMPONENT_TYPES } from "../model/defaults";
import { assertColumns, errorMessage } from "../services/dql";
import { CUSTOM_DQL_TEMPLATE, ENTITY_DQL_TEMPLATES } from "../services/queryBuilder";
import { DEFAULT_ICONS } from "../services/icons";
import { listSlos, type SloOption } from "../services/slo";
import { IconPicker } from "../toolbar/IconPicker";
import { DqlField } from "./DqlField";
import { Field, InlineMessage } from "./Field";
import { KpiBlockEditor } from "./KpiBlockEditor";
import { SidePanel } from "./SidePanel";

/**
 * How a change reaches the diagram:
 * - "none": applied to the canvas right away (name, icon, DQL text while typing);
 * - "debounced": applied and the node's status is recalculated shortly after (thresholds, filters, SLOs);
 * - "now": applied and recalculated immediately (Run).
 */
export type CommitMode = "none" | "debounced" | "now";

export interface NodeConfigPanelProps {
  nodeId: string;
  data: NodeDataType;
  timeframe: Timeframe;
  onChange: (id: string, data: NodeDataType, commit: CommitMode) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

type Update<T> = (next: T, commit?: CommitMode) => void;

const warnNoName = (r: DqlResult) =>
  r.columns.includes("name") ? null : "Warning: the DQL doesn't return a name column, so the id will be shown.";

function EntityTabs({ draft, update, timeframe }: { draft: EntityNodeData; update: Update<EntityNodeData>; timeframe: Timeframe }) {
  const changeType = (type: ComponentType) => {
    const prevType = draft.componentType;
    update(
      {
        ...draft,
        componentType: type,
        // If the user didn't touch the default template / icon / name, they change with the type.
        entityDql: draft.entityDql === ENTITY_DQL_TEMPLATES[prevType] ? ENTITY_DQL_TEMPLATES[type] : draft.entityDql,
        icon: draft.icon === DEFAULT_ICONS[prevType] ? DEFAULT_ICONS[type] : draft.icon,
        name: draft.name === COMPONENT_LABELS[prevType] ? COMPONENT_LABELS[type] : draft.name,
      },
      "debounced",
    );
  };
  const fp = draft.failPoint;
  return (
    <Tabs>
      <Tab title="Data">
        <Accordion multiple defaultExpanded={["dql", "type"]}>
          <Accordion.Section id="dql">
            <Accordion.SectionLabel>Entity DQL</Accordion.SectionLabel>
            <Accordion.SectionContent>
              <DqlField
                label="DQL"
                hint="Must return an id column (and preferably name). All rows are used. Run applies the query to the diagram."
                value={draft.entityDql}
                onChange={(v) => update({ ...draft, entityDql: v })}
                onRun={() => update(draft, "now")}
                timeframe={timeframe}
                validate={(r) => assertColumns(r, ["id"])}
                warn={warnNoName}
              />
            </Accordion.SectionContent>
          </Accordion.Section>
          <Accordion.Section id="type">
            <Accordion.SectionLabel>Component type</Accordion.SectionLabel>
            <Accordion.SectionContent>
              <Select value={draft.componentType} onChange={(v) => v && changeType(v)}>
                <Select.Content>
                  {COMPONENT_TYPES.map((t) => (
                    <Select.Option key={t} value={t}>
                      {COMPONENT_LABELS[t]}
                    </Select.Option>
                  ))}
                </Select.Content>
              </Select>
            </Accordion.SectionContent>
          </Accordion.Section>
        </Accordion>
      </Tab>
      <Tab title="Status">
        <Flex flexDirection="column" gap={12} paddingTop={12}>
          <Field
            label="Match (optional)"
            hint='DQL fragment appended as | filter … to the problems DQL. E.g. event.category == "ERROR"'
          >
            <TextInput
              value={fp.problemMatch ?? ""}
              onChange={(v) => update({ ...draft, failPoint: { ...fp, problemMatch: v.trim() ? v : undefined } }, "debounced")}
              placeholder='event.category == "ERROR"'
            />
          </Field>
          <Flex gap={12}>
            <Field label="Warning threshold (# problems)">
              <NumberInputV2
                value={fp.warningMin}
                min={1}
                onChange={(v) => update({ ...draft, failPoint: { ...fp, warningMin: Math.max(1, v ?? 1) } }, "debounced")}
              />
            </Field>
            <Field label="Failing threshold (# problems)">
              <NumberInputV2
                value={fp.failingMin}
                min={1}
                onChange={(v) => update({ ...draft, failPoint: { ...fp, failingMin: Math.max(1, v ?? 1) } }, "debounced")}
              />
            </Field>
          </Flex>
          {fp.warningMin > fp.failingMin && (
            <InlineMessage kind="warning">warning is greater than failing: the node will never turn orange.</InlineMessage>
          )}
        </Flex>
      </Tab>
      <Tab title="Visual">
        <Flex flexDirection="column" gap={12} paddingTop={12}>
          <Field label="Name" required>
            <TextInput value={draft.name} onChange={(v) => update({ ...draft, name: v })} />
          </Field>
          <Field label="Icon">
            <IconPicker value={draft.icon} componentType={draft.componentType} onChange={(icon) => update({ ...draft, icon })} />
          </Field>
        </Flex>
      </Tab>
      <Tab title="KPIs">
        <KpiBlockEditor
          value={draft.kpi}
          onChange={(kpi, commit) => update({ ...draft, kpi }, commit)}
          timeframe={timeframe}
        />
      </Tab>
    </Tabs>
  );
}

function CustomTabs({ draft, update, timeframe }: { draft: CustomNodeData; update: Update<CustomNodeData>; timeframe: Timeframe }) {
  const [columns, setColumns] = useState<string[]>([]);
  const [slos, setSlos] = useState<SloOption[] | null>(null);
  const [sloError, setSloError] = useState<string | null>(null);
  const entities = draft.entities ?? { dql: CUSTOM_DQL_TEMPLATE, subNameField: "name", criterion: "anyProblem" as const };

  useEffect(() => {
    if (draft.mode !== "slos" || slos !== null) {
      return undefined;
    }
    const controller = new AbortController();
    listSlos(controller.signal)
      .then(setSlos)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setSloError(errorMessage(e));
          setSlos([]);
        }
      });
    return () => controller.abort();
  }, [draft.mode, slos]);

  const nameFieldOptions = Array.from(new Set([entities.subNameField, ...columns].filter(Boolean)));
  const selectedSloIds = (draft.slos ?? []).map((s) => s.id);
  const sloOptions: SloOption[] = [
    ...(slos ?? []),
    // Saved SLOs no longer in the list (deleted or no permission) stay visible so they can be removed.
    ...(draft.slos ?? []).filter((s) => !(slos ?? []).some((o) => o.id === s.id)),
  ];

  return (
    <Tabs>
      <Tab title="Data">
        <Flex flexDirection="column" gap={12} paddingTop={12}>
          <Field label="Mode">
            <ToggleButtonGroup
              value={draft.mode}
              onChange={(v) => update({ ...draft, mode: v === "slos" ? "slos" : "entities" }, "debounced")}
            >
              <ToggleButtonGroup.Item value="entities">Entities</ToggleButtonGroup.Item>
              <ToggleButtonGroup.Item value="slos">SLOs</ToggleButtonGroup.Item>
            </ToggleButtonGroup>
          </Field>
          {draft.mode === "entities" ? (
            <Accordion multiple defaultExpanded={["dql", "options"]}>
              <Accordion.Section id="dql">
                <Accordion.SectionLabel>Entity DQL</Accordion.SectionLabel>
                <Accordion.SectionContent>
                  <DqlField
                    label="DQL"
                    hint="Required: must return id and name columns. Each row is one child. Run applies the query to the diagram."
                    value={entities.dql}
                    onChange={(v) => update({ ...draft, entities: { ...entities, dql: v } })}
                    onRun={() => update(draft, "now")}
                    timeframe={timeframe}
                    validate={(r) => assertColumns(r, ["id", "name"])}
                    onResult={(r) => setColumns(r?.columns ?? [])}
                  />
                </Accordion.SectionContent>
              </Accordion.Section>
              <Accordion.Section id="options">
                <Accordion.SectionLabel>Options</Accordion.SectionLabel>
                <Accordion.SectionContent>
                  <Flex flexDirection="column" gap={12}>
                    <Field label="Child name field" hint="Run the query to see all columns.">
                      <Select
                        value={entities.subNameField}
                        onChange={(v) => v && update({ ...draft, entities: { ...entities, subNameField: v } }, "debounced")}
                      >
                        <Select.Content>
                          {nameFieldOptions.map((c) => (
                            <Select.Option key={c} value={c}>
                              {c}
                            </Select.Option>
                          ))}
                        </Select.Content>
                      </Select>
                    </Field>
                    <Field label="Criterion">
                      <Select
                        value={entities.criterion}
                        onChange={(v) => v && update({ ...draft, entities: { ...entities, criterion: v } }, "debounced")}
                      >
                        <Select.Content>
                          <Select.Option value="anyProblem">Any active problem turns the entity red</Select.Option>
                          <Select.Option value="match">Only problems that satisfy the match</Select.Option>
                        </Select.Content>
                      </Select>
                    </Field>
                    {entities.criterion === "match" && (
                      <Field label="Match" hint='DQL fragment for | filter … E.g. event.category == "AVAILABILITY"'>
                        <TextInput
                          value={entities.problemMatch ?? ""}
                          onChange={(v) =>
                            update({ ...draft, entities: { ...entities, problemMatch: v.trim() ? v : undefined } }, "debounced")
                          }
                        />
                      </Field>
                    )}
                  </Flex>
                </Accordion.SectionContent>
              </Accordion.Section>
            </Accordion>
          ) : (
            <Field label="SLOs" hint="Status is evaluated using the timeframe defined in each SLO.">
              {sloError && <InlineMessage kind="error">{sloError}</InlineMessage>}
              <Select
                multiple
                value={selectedSloIds}
                onChange={(ids) =>
                  update(
                    {
                      ...draft,
                      slos: (ids ?? []).map((id) => {
                        const opt = sloOptions.find((o) => o.id === id);
                        return { id, name: opt?.name ?? id };
                      }),
                    },
                    "debounced",
                  )
                }
              >
                <Select.Content loading={slos === null}>
                  {sloOptions.map((o) => (
                    <Select.Option key={o.id} value={o.id}>
                      {o.name}
                    </Select.Option>
                  ))}
                </Select.Content>
              </Select>
              {slos !== null && slos.length === 0 && !sloError && (
                <InlineMessage kind="info">There are no SLOs in this environment.</InlineMessage>
              )}
            </Field>
          )}
        </Flex>
      </Tab>
      <Tab title="Visual">
        <Flex flexDirection="column" gap={12} paddingTop={12}>
          <Field label="Name" required>
            <TextInput value={draft.name} onChange={(v) => update({ ...draft, name: v })} />
          </Field>
          <Field label="Icon">
            <IconPicker value={draft.icon} componentType="custom" onChange={(icon) => update({ ...draft, icon })} />
          </Field>
          <Field label="Visible rows before scrolling">
            <NumberInputV2
              value={draft.maxVisibleRows}
              min={1}
              max={50}
              onChange={(v) => update({ ...draft, maxVisibleRows: Math.max(1, v ?? 8) })}
            />
          </Field>
        </Flex>
      </Tab>
      <Tab title="KPIs">
        <KpiBlockEditor
          value={draft.kpi}
          onChange={(kpi, commit) => update({ ...draft, kpi }, commit)}
          timeframe={timeframe}
        />
      </Tab>
    </Tabs>
  );
}

/**
 * Node editor docked to the right of the canvas (like the tile editor in Dashboards).
 * There is no Apply button: valid changes reach the diagram as you edit, and undo (Ctrl+Z) reverts them.
 * The parent mounts it with key={nodeId}, so the local draft resets when another node is selected.
 */
export function NodeConfigPanel({ nodeId, data, timeframe, onChange, onDelete, onClose }: NodeConfigPanelProps) {
  const [draft, setDraft] = useState<NodeDataType>(() => structuredClone(data));
  const [error, setError] = useState<string | null>(null);

  const update = (next: NodeDataType, commit: CommitMode = "none") => {
    setDraft(next);
    const parsed = NodeData.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return;
    }
    setError(null);
    onChange(nodeId, parsed.data, commit);
  };

  const subtitle =
    draft.kind === "entity"
      ? `Component · ${COMPONENT_LABELS[draft.componentType]}`
      : `Custom component · ${draft.mode === "slos" ? "SLOs" : "Entities"}`;

  return (
    <SidePanel
      title={draft.name || "(untitled)"}
      subtitle={subtitle}
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
            <Menu.Item onSelect={() => onDelete(nodeId)}>
              <Menu.Prefix>
                <DeleteIcon />
              </Menu.Prefix>
              Delete component
            </Menu.Item>
          </Menu.Content>
        </Menu>
      }
    >
      <Flex flexDirection="column" gap={8}>
        {!draft.name.trim() && <InlineMessage kind="warning">Name is required.</InlineMessage>}
        {error && <InlineMessage kind="error">{error}</InlineMessage>}
        {draft.kind === "entity" ? (
          <EntityTabs draft={draft} update={update} timeframe={timeframe} />
        ) : (
          <CustomTabs draft={draft} update={update} timeframe={timeframe} />
        )}
      </Flex>
    </SidePanel>
  );
}
