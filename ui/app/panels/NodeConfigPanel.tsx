import React, { useEffect, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { NumberInputV2, Select, TextInput, ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { DeleteIcon } from "@dynatrace/strato-icons";
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
import { Field, InlineMessage, SectionTitle } from "./Field";
import { KpiBlockEditor } from "./KpiBlockEditor";

export interface NodeConfigPanelProps {
  nodeId: string | null;
  data: NodeDataType | null;
  timeframe: Timeframe;
  onApply: (id: string, data: NodeDataType) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const warnNoName = (r: DqlResult) =>
  r.columns.includes("name") ? null : "Aviso: la DQL no devuelve la columna name; se mostrará el id.";

function EntityForm({
  draft,
  setDraft,
  timeframe,
}: {
  draft: EntityNodeData;
  setDraft: (d: EntityNodeData) => void;
  timeframe: Timeframe;
}) {
  const changeType = (type: ComponentType) => {
    const prevType = draft.componentType;
    setDraft({
      ...draft,
      componentType: type,
      // If the user didn't touch the default template / icon / name, they change with the type.
      entityDql: draft.entityDql === ENTITY_DQL_TEMPLATES[prevType] ? ENTITY_DQL_TEMPLATES[type] : draft.entityDql,
      icon: draft.icon === DEFAULT_ICONS[prevType] ? DEFAULT_ICONS[type] : draft.icon,
      name: draft.name === COMPONENT_LABELS[prevType] ? COMPONENT_LABELS[type] : draft.name,
    });
  };
  const fp = draft.failPoint;
  return (
    <Flex flexDirection="column" gap={12}>
      <Field label="Tipo">
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
      <Field label="Nombre" required>
        <TextInput value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
      </Field>
      <DqlField
        label="DQL de entidad"
        hint="Debe devolver la columna id (y preferiblemente name). Se usan todas las filas."
        value={draft.entityDql}
        onChange={(v) => setDraft({ ...draft, entityDql: v })}
        timeframe={timeframe}
        validate={(r) => assertColumns(r, ["id"])}
        warn={warnNoName}
      />
      <Field label="Icono">
        <IconPicker value={draft.icon} componentType={draft.componentType} onChange={(icon) => setDraft({ ...draft, icon })} />
      </Field>
      <SectionTitle>Fail point</SectionTitle>
      <Field label="Match (opcional)" hint='Fragmento DQL que se añade como | filter … a la DQL de problems. Ej.: event.category == "ERROR"'>
        <TextInput
          value={fp.problemMatch ?? ""}
          onChange={(v) => setDraft({ ...draft, failPoint: { ...fp, problemMatch: v.trim() ? v : undefined } })}
          placeholder='event.category == "ERROR"'
        />
      </Field>
      <Flex gap={12}>
        <Field label="Umbral warning (nº problems)">
          <NumberInputV2
            value={fp.warningMin}
            min={1}
            onChange={(v) => setDraft({ ...draft, failPoint: { ...fp, warningMin: Math.max(1, v ?? 1) } })}
          />
        </Field>
        <Field label="Umbral failing (nº problems)">
          <NumberInputV2
            value={fp.failingMin}
            min={1}
            onChange={(v) => setDraft({ ...draft, failPoint: { ...fp, failingMin: Math.max(1, v ?? 1) } })}
          />
        </Field>
      </Flex>
      {fp.warningMin > fp.failingMin && (
        <InlineMessage kind="warning">warning es mayor que failing: el nodo nunca se pondrá naranja.</InlineMessage>
      )}
      <KpiBlockEditor value={draft.kpi} onChange={(kpi) => setDraft({ ...draft, kpi })} timeframe={timeframe} />
    </Flex>
  );
}

function CustomForm({
  draft,
  setDraft,
  timeframe,
}: {
  draft: CustomNodeData;
  setDraft: (d: CustomNodeData) => void;
  timeframe: Timeframe;
}) {
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
    <Flex flexDirection="column" gap={12}>
      <Field label="Nombre" required>
        <TextInput value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
      </Field>
      <Field label="Icono">
        <IconPicker value={draft.icon} componentType="custom" onChange={(icon) => setDraft({ ...draft, icon })} />
      </Field>
      <Field label="Modo">
        <ToggleButtonGroup value={draft.mode} onChange={(v) => setDraft({ ...draft, mode: v === "slos" ? "slos" : "entities" })}>
          <ToggleButtonGroup.Item value="entities">Entidades</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="slos">SLOs</ToggleButtonGroup.Item>
        </ToggleButtonGroup>
      </Field>

      {draft.mode === "entities" ? (
        <>
          <DqlField
            label="DQL de entidades"
            hint="Obligatorio: debe devolver las columnas id y name. Una fila = un subcomponente."
            value={entities.dql}
            onChange={(v) => setDraft({ ...draft, entities: { ...entities, dql: v } })}
            timeframe={timeframe}
            validate={(r) => assertColumns(r, ["id", "name"])}
            onResult={(r) => setColumns(r?.columns ?? [])}
          />
          <Field label="Campo del nombre del subcomponente" hint="Ejecuta la DQL (Run) para ver todas las columnas.">
            <Select
              value={entities.subNameField}
              onChange={(v) => v && setDraft({ ...draft, entities: { ...entities, subNameField: v } })}
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
          <Field label="Criterio">
            <Select
              value={entities.criterion}
              onChange={(v) => v && setDraft({ ...draft, entities: { ...entities, criterion: v } })}
            >
              <Select.Content>
                <Select.Option value="anyProblem">Cualquier problem activo pone la entidad en rojo</Select.Option>
                <Select.Option value="match">Solo los problems que cumplen el match</Select.Option>
              </Select.Content>
            </Select>
          </Field>
          {entities.criterion === "match" && (
            <Field label="Match" hint='Fragmento DQL para | filter … Ej.: event.category == "AVAILABILITY"'>
              <TextInput
                value={entities.problemMatch ?? ""}
                onChange={(v) =>
                  setDraft({ ...draft, entities: { ...entities, problemMatch: v.trim() ? v : undefined } })
                }
              />
            </Field>
          )}
        </>
      ) : (
        <Field label="SLOs" hint="El estado se evalúa con el timeframe definido en cada SLO.">
          {sloError && <InlineMessage kind="error">{sloError}</InlineMessage>}
          <Select
            multiple
            value={selectedSloIds}
            onChange={(ids) =>
              setDraft({
                ...draft,
                slos: (ids ?? []).map((id) => {
                  const opt = sloOptions.find((o) => o.id === id);
                  return { id, name: opt?.name ?? id };
                }),
              })
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
            <InlineMessage kind="info">No hay SLOs en este entorno.</InlineMessage>
          )}
        </Field>
      )}

      <Field label="Filas visibles antes de hacer scroll">
        <NumberInputV2
          value={draft.maxVisibleRows}
          min={1}
          max={50}
          onChange={(v) => setDraft({ ...draft, maxVisibleRows: Math.max(1, v ?? 8) })}
        />
      </Field>
      <KpiBlockEditor value={draft.kpi} onChange={(kpi) => setDraft({ ...draft, kpi })} timeframe={timeframe} />
    </Flex>
  );
}

/** Node create/edit form (entity or custom component). */
export function NodeConfigPanel({ nodeId, data, timeframe, onApply, onDelete, onClose }: NodeConfigPanelProps) {
  const [draft, setDraft] = useState<NodeDataType | null>(data);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(data ? structuredClone(data) : null);
    setError(null);
  }, [nodeId, data]);

  const apply = () => {
    if (!nodeId || !draft) {
      return;
    }
    if (!draft.name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (draft.kind === "entity" && !draft.entityDql.trim()) {
      setError("La DQL de entidad es obligatoria.");
      return;
    }
    const parsed = NodeData.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return;
    }
    onApply(nodeId, parsed.data);
  };

  const title = draft?.kind === "custom" ? "Custom component" : "Componente";

  return (
    <Sheet
      title={title}
      show={Boolean(nodeId && draft)}
      onDismiss={onClose}
      actions={
        <Flex gap={8}>
          <Button color="critical" onClick={() => nodeId && onDelete(nodeId)}>
            <Button.Prefix>
              <DeleteIcon />
            </Button.Prefix>
            Eliminar
          </Button>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="accent" color="primary" onClick={apply}>
            Aplicar
          </Button>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={12} style={{ maxWidth: 640 }}>
        {error && <InlineMessage kind="error">{error}</InlineMessage>}
        {draft?.kind === "entity" && (
          <EntityForm draft={draft} setDraft={(d) => setDraft(d)} timeframe={timeframe} />
        )}
        {draft?.kind === "custom" && (
          <CustomForm draft={draft} setDraft={(d) => setDraft(d)} timeframe={timeframe} />
        )}
      </Flex>
    </Sheet>
  );
}
