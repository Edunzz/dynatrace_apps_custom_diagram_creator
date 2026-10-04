import React from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Select, TextInput, ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { TimeframeSelector } from "@dynatrace/strato-components/filters";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import {
  ArrowLeftIcon,
  DownloadIcon,
  EditIcon,
  RedoIcon,
  RefreshIcon,
  SaveIcon,
  DistributeIcon,
  UndoIcon,
  ViewIcon,
  ZoomInIcon,
  ZoomOutIcon,
  ZoomToFitIcon,
} from "@dynatrace/strato-icons";
import type { Background, RefreshInterval } from "../model/schema";
import type { Timeframe } from "../model/types";
import type { EditorMode } from "../canvas/DiagramContext";
import { formatTime } from "../services/time";

export interface EditorToolbarProps {
  name: string;
  onNameChange: (name: string) => void;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  refreshInterval: RefreshInterval;
  onRefreshIntervalChange: (v: RefreshInterval) => void;
  onRefresh: () => void;
  refreshing: boolean;
  lastUpdated?: Date;
  background: Background;
  onBackgroundChange: (b: Background) => void;
  mode: EditorMode;
  onModeChange: (m: EditorMode) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onAutoLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
}

const REFRESH_OPTIONS: Array<{ value: RefreshInterval; label: string }> = [
  { value: "off", label: "Off" },
  { value: "30s", label: "30 s" },
  { value: "1m", label: "1 m" },
  { value: "5m", label: "5 m" },
  { value: "15m", label: "15 m" },
  { value: "30m", label: "30 m" },
];

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip text={label}>
      <Button aria-label={label} onClick={onClick} disabled={disabled} size="condensed">
        <Button.Prefix>{children}</Button.Prefix>
      </Button>
    </Tooltip>
  );
}

export function EditorToolbar(props: EditorToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const edit = props.mode === "edit";

  return (
    <Flex
      flexDirection="column"
      gap={8}
      padding={8}
      style={{ borderBottom: `1px solid ${Colors.Border.Neutral.Default}`, background: Colors.Background.Surface.Default }}
    >
      <Flex alignItems="center" gap={8} flexWrap="wrap">
        <IconButton label="Volver a la lista" onClick={props.onBack}>
          <ArrowLeftIcon />
        </IconButton>
        <div style={{ width: 280 }}>
          <TextInput value={props.name} onChange={(v) => props.onNameChange(v)} aria-label="Nombre del diagrama" readOnly={!edit} />
        </div>
        {props.dirty && <span style={{ fontSize: 12, color: Colors.Text.Warning.Default }}>● Cambios sin guardar</span>}
        <div style={{ flex: 1 }} />
        <ToggleButtonGroup value={props.mode} onChange={(v) => props.onModeChange(v === "view" ? "view" : "edit")}>
          <ToggleButtonGroup.Item value="edit">
            <ToggleButtonGroup.Prefix>
              <EditIcon />
            </ToggleButtonGroup.Prefix>
            Edición
          </ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="view">
            <ToggleButtonGroup.Prefix>
              <ViewIcon />
            </ToggleButtonGroup.Prefix>
            Vista
          </ToggleButtonGroup.Item>
        </ToggleButtonGroup>
        <Button variant="accent" color="primary" onClick={props.onSave} loading={props.saving} disabled={!edit && !props.dirty}>
          <Button.Prefix>
            <SaveIcon />
          </Button.Prefix>
          Guardar
        </Button>
        <Button onClick={props.onSaveAs}>Guardar como</Button>
        <Button onClick={props.onExport}>
          <Button.Prefix>
            <DownloadIcon />
          </Button.Prefix>
          Exportar JSON
        </Button>
      </Flex>

      <Flex alignItems="center" gap={8} flexWrap="wrap">
        <TimeframeSelector
          value={{ from: props.timeframe.from, to: props.timeframe.to }}
          onChange={(v) => {
            if (v) {
              props.onTimeframeChange({ from: v.from.value, to: v.to.value });
            }
          }}
        />
        <Flex alignItems="center" gap={4}>
          <span style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>Auto-refresh</span>
          <div style={{ width: 90 }}>
            <Select value={props.refreshInterval} onChange={(v) => v && props.onRefreshIntervalChange(v)}>
              <Select.Content>
                {REFRESH_OPTIONS.map((o) => (
                  <Select.Option key={o.value} value={o.value}>
                    {o.label}
                  </Select.Option>
                ))}
              </Select.Content>
            </Select>
          </div>
          <IconButton label="Refrescar ahora" onClick={props.onRefresh}>
            <RefreshIcon />
          </IconButton>
        </Flex>
        <span style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued, minWidth: 170 }}>
          {props.refreshing ? "Actualizando…" : `Última actualización: ${formatTime(props.lastUpdated)}`}
        </span>
        <div style={{ flex: 1 }} />
        <ToggleButtonGroup value={props.background} onChange={(v) => props.onBackgroundChange(v === "grid" ? "grid" : v === "blank" ? "blank" : "dots")}>
          <ToggleButtonGroup.Item value="dots">Puntos</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="grid">Cuadrícula</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="blank">Blanco</ToggleButtonGroup.Item>
        </ToggleButtonGroup>
        <Flex alignItems="center" gap={2}>
          <IconButton label="Alejar" onClick={() => void zoomOut()}>
            <ZoomOutIcon />
          </IconButton>
          <span style={{ fontSize: 12, width: 44, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
            {Math.round(zoom * 100)} %
          </span>
          <IconButton label="Acercar" onClick={() => void zoomIn()}>
            <ZoomInIcon />
          </IconButton>
          <IconButton label="Ajustar a la vista" onClick={() => void fitView({ padding: 0.15, duration: 300 })}>
            <ZoomToFitIcon />
          </IconButton>
        </Flex>
        {edit && (
          <Flex alignItems="center" gap={2}>
            <IconButton label="Deshacer (Ctrl+Z)" onClick={props.onUndo} disabled={!props.canUndo}>
              <UndoIcon />
            </IconButton>
            <IconButton label="Rehacer (Ctrl+Y)" onClick={props.onRedo} disabled={!props.canRedo}>
              <RedoIcon />
            </IconButton>
            <Button size="condensed" onClick={props.onAutoLayout}>
              <Button.Prefix>
                <DistributeIcon />
              </Button.Prefix>
              Ordenar automáticamente
            </Button>
          </Flex>
        )}
      </Flex>
    </Flex>
  );
}
