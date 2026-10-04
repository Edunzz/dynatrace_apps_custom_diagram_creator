import React, { useEffect, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { NumberInputV2, Select, Switch, TextInput, ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { DeleteIcon } from "@dynatrace/strato-icons";
import { EdgeKpi, type DiagramEdge } from "../model/schema";
import type { Timeframe } from "../model/types";
import { DEFAULT_EDGE_KPI_DQL } from "../model/defaults";
import { assertSingleValue, numericColumns } from "../services/dql";
import { DqlField } from "./DqlField";
import { Field, InlineMessage, SectionTitle } from "./Field";

export interface EdgeDraft {
  type: DiagramEdge["type"];
  direction: DiagramEdge["direction"];
  label?: string;
  kpi?: DiagramEdge["kpi"];
}

export interface EdgeConfigPanelProps {
  edgeId: string | null;
  value: EdgeDraft | null;
  timeframe: Timeframe;
  onApply: (id: string, draft: EdgeDraft) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const FIRST_NUMERIC = "__first_numeric__";

const defaultKpi = (): NonNullable<DiagramEdge["kpi"]> => ({
  dql: DEFAULT_EDGE_KPI_DQL,
  unit: "ms",
  decimals: 2,
  animated: true,
  threshold: { direction: "above", warning: null, failing: null },
});

export function EdgeConfigPanel({ edgeId, value, timeframe, onApply, onDelete, onClose }: EdgeConfigPanelProps) {
  const [draft, setDraft] = useState<EdgeDraft | null>(value);
  const [columns, setColumns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value ? structuredClone(value) : null);
    setColumns([]);
    setError(null);
  }, [edgeId, value]);

  if (!draft) {
    return <Sheet show={false} title="Conexión" onDismiss={onClose} />;
  }

  const kpi = draft.kpi ?? defaultKpi();
  const setKpi = (k: NonNullable<DiagramEdge["kpi"]>) => setDraft({ ...draft, kpi: k });
  const t = kpi.threshold;
  const fieldOptions = Array.from(new Set([kpi.valueField, ...columns].filter((c): c is string => Boolean(c))));

  const apply = () => {
    if (!edgeId) {
      return;
    }
    if (draft.type === "kpi") {
      const parsed = EdgeKpi.safeParse(kpi);
      if (!parsed.success) {
        setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        return;
      }
      if (!kpi.dql.trim()) {
        setError("La DQL del KPI es obligatoria.");
        return;
      }
      onApply(edgeId, { ...draft, kpi: parsed.data });
    } else {
      onApply(edgeId, { type: "normal", direction: draft.direction, label: draft.label });
    }
  };

  return (
    <Sheet
      title="Conexión"
      show={Boolean(edgeId)}
      onDismiss={onClose}
      actions={
        <Flex gap={8}>
          <Button color="critical" onClick={() => edgeId && onDelete(edgeId)}>
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
        <Field label="Tipo de conexión">
          <ToggleButtonGroup
            value={draft.type}
            onChange={(v) => setDraft({ ...draft, type: v === "kpi" ? "kpi" : "normal", kpi: v === "kpi" ? kpi : draft.kpi })}
          >
            <ToggleButtonGroup.Item value="normal">Normal</ToggleButtonGroup.Item>
            <ToggleButtonGroup.Item value="kpi">KPI relation</ToggleButtonGroup.Item>
          </ToggleButtonGroup>
        </Field>
        <Field label="Dirección">
          <ToggleButtonGroup
            value={draft.direction}
            onChange={(v) => setDraft({ ...draft, direction: v === "backward" ? "backward" : v === "none" ? "none" : "forward" })}
          >
            <ToggleButtonGroup.Item value="forward">→ origen a destino</ToggleButtonGroup.Item>
            <ToggleButtonGroup.Item value="backward">← destino a origen</ToggleButtonGroup.Item>
            <ToggleButtonGroup.Item value="none">— sin flecha</ToggleButtonGroup.Item>
          </ToggleButtonGroup>
        </Field>
        <Field label="Etiqueta (opcional)">
          <TextInput value={draft.label ?? ""} onChange={(v) => setDraft({ ...draft, label: v || undefined })} />
        </Field>

        {draft.type === "kpi" && (
          <>
            <SectionTitle>KPI</SectionTitle>
            <DqlField
              label="DQL (debe devolver un único valor)"
              hint="Se toma la primera fila y la columna elegida (o la primera numérica)."
              value={kpi.dql}
              onChange={(v) => setKpi({ ...kpi, dql: v })}
              timeframe={timeframe}
              validate={(r) => {
                const single = assertSingleValue(r, kpi.valueField);
                return single.ok ? null : single.error;
              }}
              onResult={(r) => setColumns(r ? numericColumns(r) : [])}
            />
            <Field label="Columna del valor">
              <Select
                value={kpi.valueField ?? FIRST_NUMERIC}
                onChange={(v) => setKpi({ ...kpi, valueField: !v || v === FIRST_NUMERIC ? undefined : v })}
              >
                <Select.Content>
                  <Select.Option value={FIRST_NUMERIC}>Primera columna numérica</Select.Option>
                  {fieldOptions.map((c) => (
                    <Select.Option key={c} value={c}>
                      {c}
                    </Select.Option>
                  ))}
                </Select.Content>
              </Select>
            </Field>
            <Flex gap={12}>
              <Field label="Unidad">
                <TextInput value={kpi.unit ?? ""} onChange={(v) => setKpi({ ...kpi, unit: v || undefined })} placeholder="ms, %, req/s…" />
              </Field>
              <Field label="Decimales">
                <NumberInputV2 value={kpi.decimals} min={0} max={10} onChange={(v) => setKpi({ ...kpi, decimals: Math.min(10, Math.max(0, v ?? 2)) })} />
              </Field>
            </Flex>
            <SectionTitle>Umbral</SectionTitle>
            <Field label="Dirección del umbral">
              <Select
                value={t.direction}
                onChange={(v) => v && setKpi({ ...kpi, threshold: { ...t, direction: v } })}
              >
                <Select.Content>
                  <Select.Option value="above">above: malo si el valor está por encima</Select.Option>
                  <Select.Option value="below">below: malo si el valor está por debajo</Select.Option>
                </Select.Content>
              </Select>
            </Field>
            <Flex gap={12}>
              <Field label="Warning">
                <NumberInputV2 value={t.warning} onChange={(v) => setKpi({ ...kpi, threshold: { ...t, warning: v } })} />
              </Field>
              <Field label="Failing">
                <NumberInputV2 value={t.failing} onChange={(v) => setKpi({ ...kpi, threshold: { ...t, failing: v } })} />
              </Field>
            </Flex>
            <Switch value={kpi.animated} onChange={(checked) => setKpi({ ...kpi, animated: checked })}>
              Animar (bolitas en el sentido de la flecha)
            </Switch>
          </>
        )}
      </Flex>
    </Sheet>
  );
}
