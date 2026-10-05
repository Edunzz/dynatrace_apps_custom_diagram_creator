import React, { useEffect, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Accordion, CodeSnippet } from "@dynatrace/strato-components/content";
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
import type { Timeframe } from "../model/types";
import { COMPONENT_LABELS, COMPONENT_TYPES } from "../model/defaults";
import { assertColumns, errorMessage } from "../services/dql";
import { CUSTOM_DQL_TEMPLATE } from "../services/queryBuilder";
import { DEFAULT_ICONS } from "../services/icons";
import { listSlos, type SloOption } from "../services/slo";
import { IconPicker } from "../toolbar/IconPicker";
import { DqlField } from "./DqlField";
import { EntityPicker } from "./EntityPicker";
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

function EntityTabs({ draft, update, timeframe }: { draft: EntityNodeData; update: Update<EntityNodeData>; timeframe: Timeframe }) {
  const changeType = (type: ComponentType) => {
    const prevType = draft.componentType;
    update(
      {
        ...draft,
        componentType: type,
        // Picked entities belong to the previous type, so the selection (and any query) starts over.
        entities: [],
        entityDql: undefined,
        // If the user didn't touch the default icon / name, they change with the type.
        icon: draft.icon === DEFAULT_ICONS[prevType] ? DEFAULT_ICONS[type] : draft.icon,
        name: draft.name === COMPONENT_LABELS[prevType] ? COMPONENT_LABELS[type] : draft.name,
      },
      "debounced",
    );
  };
  const fp = draft.failPoint;
  const usesQuery = draft.entities.length === 0 && Boolean(draft.entityDql?.trim());
  return (
    <Tabs>
      <Tab title="Data">
        <Flex flexDirection="column" gap={12} paddingTop={12}>
          <Field label="Component type" hint="Which kind of entity this component represents. Changing it clears the selection.">
            <Select value={draft.componentType} onChange={(v) => v && changeType(v)}>
              <Select.Content>
                {COMPONENT_TYPES.map((t) => (
                  <Select.Option key={t} value={t}>
                    {COMPONENT_LABELS[t]}
                  </Select.Option>
                ))}
              </Select.Content>
            </Select>
          </Field>
          <Field
            label={`${COMPONENT_LABELS[draft.componentType]} entities`}
            hint="Pick one or more entities. The component turns orange or red from the active Davis problems that affect any of them."
          >
            <EntityPicker
              componentType={draft.componentType}
              value={draft.entities}
              // Picking entities replaces any query the component had.
              onChange={(entities) => update({ ...draft, entities, entityDql: entities.length ? undefined : draft.entityDql }, "debounced")}
            />
          </Field>
          {usesQuery && (
            <Flex flexDirection="column" gap={6}>
              <InlineMessage kind="info">
                This component selects its entities with a query (from the sample diagram, an imported file or the agent
                skill). Picking entities above replaces the query with a fixed selection.
              </InlineMessage>
              <CodeSnippet language="dql" lineBreaks maxHeight={160}>
                {draft.entityDql ?? ""}
              </CodeSnippet>
              <div>
                <Button size="condensed" onClick={() => update({ ...draft, entityDql: undefined }, "debounced")}>
                  Remove the query
                </Button>
              </div>
            </Flex>
          )}
        </Flex>
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
          <InlineMessage kind="info">
            A custom component is a container with one row per child — an entity or an SLO — each with its own status
            light. The container's color sums them up: red when every child is red, orange when at least one child is red
            or orange, green when all are green, and gray when there are no children or some have no data.
          </InlineMessage>
          <Field
            label="Mode"
            hint={
              draft.mode === "entities"
                ? "Entities: one row per entity returned by your query, colored by the Davis problems affecting it."
                : "SLOs: one row per selected SLO, colored by its evaluation."
            }
          >
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
                    hint="One row per child. Required columns: id (the entity id matched against Davis problems; Smartscape ids such as SERVICE-… and classic ids both work, and an id_classic column is matched too) and name. Run previews the rows and applies the query."
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
                    <Field label="Child name field" hint="Column shown as each row's label (default: name). Run the query to list all its columns.">
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
                    <Field
                      label="Criterion"
                      hint="Which problems turn a child red: any active problem affecting that entity, or only the active problems that also satisfy the match."
                    >
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
                      <Field
                        label="Match"
                        hint='DQL filter fragment appended as | filter <match> to the problem query, e.g. event.category == "AVAILABILITY".'
                      >
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
            <Field
              label="SLOs"
              hint="Each row shows the SLO's current value and error budget: green when it meets its target, orange below its warning, red below its target. Each SLO is evaluated with the timeframe defined in the SLO, not the page timeframe."
            >
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
          <Field label="Name" required hint="Shown in the container header.">
            <TextInput value={draft.name} onChange={(v) => update({ ...draft, name: v })} />
          </Field>
          <Field label="Icon" hint="Any Strato icon, shown next to the name.">
            <IconPicker value={draft.icon} componentType="custom" onChange={(icon) => update({ ...draft, icon })} />
          </Field>
          <Field
            label="Visible rows before scrolling"
            hint="Rows shown before the container scrolls. A container with a single entity shows it as one large block instead."
          >
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
