import React from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import type { ComponentType } from "../model/schema";
import { COMPONENT_LABELS, COMPONENT_TYPES } from "../model/defaults";
import { DEFAULT_ICONS, resolveIcon } from "../services/icons";

export type PaletteItem = ComponentType | "custom";
export const PALETTE_MIME = "application/x-cdc-node";

/** Side palette: items are dragged onto the canvas (or added via click / Enter). */
export function Palette({ onAdd }: { onAdd: (item: PaletteItem) => void }) {
  const items: Array<{ id: PaletteItem; label: string }> = [
    ...COMPONENT_TYPES.map((t) => ({ id: t, label: COMPONENT_LABELS[t] })),
    { id: "custom", label: "Custom component" },
  ];
  return (
    <div
      style={{
        width: 190,
        flexShrink: 0,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        borderRight: `1px solid ${Colors.Border.Neutral.Default}`,
        background: Colors.Background.Base.Default,
        overflowY: "auto",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: Colors.Text.Neutral.Subdued, marginBottom: 4 }}>Componentes</div>
      {items.map((item) => {
        const Icon = resolveIcon(DEFAULT_ICONS[item.id]);
        return (
          <div
            key={item.id}
            className="cdc-palette-item"
            draggable
            role="button"
            tabIndex={0}
            title="Arrastra al lienzo o pulsa para añadir"
            onDragStart={(e) => {
              e.dataTransfer.setData(PALETTE_MIME, item.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onAdd(item.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAdd(item.id);
              }
            }}
          >
            <Icon />
            <span>{item.label}</span>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: Colors.Text.Neutral.Subdued, marginTop: 8, lineHeight: 1.4 }}>
        Doble clic en un nodo o conexión para configurarlo. Arrastra desde los puntos de un nodo para conectarlo.
        Supr/Retroceso elimina la selección.
      </div>
    </div>
  );
}
