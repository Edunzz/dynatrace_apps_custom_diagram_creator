import React, { useState } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { TextInput } from "@dynatrace/strato-components/forms";
import { COMPONENT_CATEGORIES, COMPONENT_TYPE_DEFS, matchesComponentType } from "../model/componentTypes";
import type { ComponentType } from "../model/schema";
import { COMPONENT_LABELS, COMPONENT_TYPES } from "../model/defaults";
import { DEFAULT_ICONS, resolveIcon } from "../services/icons";

export type PaletteItem = ComponentType | "custom";
export const PALETTE_MIME = "application/x-cdc-node";

function PaletteEntry({ id, label, pinned, onAdd }: { id: PaletteItem; label: string; pinned?: boolean; onAdd: (item: PaletteItem) => void }) {
  const Icon = resolveIcon(DEFAULT_ICONS[id]);
  return (
    <div
      className={`cdc-palette-item${pinned ? " cdc-palette-item--pinned" : ""}`}
      draggable
      role="button"
      tabIndex={0}
      title="Drag onto the canvas or click to add"
      onDragStart={(e) => {
        e.dataTransfer.setData(PALETTE_MIME, id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onAdd(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAdd(id);
        }
      }}
    >
      <Icon />
      <span>{label}</span>
    </div>
  );
}

/**
 * Side palette: items are dragged onto the canvas (or added via click / Enter). The custom component is pinned on
 * top; entity types are grouped by category and can be filtered by name, category or Smartscape type.
 */
export function Palette({ onAdd }: { onAdd: (item: PaletteItem) => void }) {
  const [filter, setFilter] = useState("");
  const groups = COMPONENT_CATEGORIES.map((category) => ({
    category,
    types: COMPONENT_TYPES.filter((t) => COMPONENT_TYPE_DEFS[t].category === category && matchesComponentType(t, filter)),
  })).filter((g) => g.types.length > 0);

  return (
    <div
      style={{
        width: 210,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        borderRight: `1px solid ${Colors.Border.Neutral.Default}`,
        background: Colors.Background.Base.Default,
      }}
    >
      <div style={{ padding: "10px 10px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: Colors.Text.Neutral.Subdued }}>Components</div>
        <PaletteEntry id="custom" label="Custom component" pinned onAdd={onAdd} />
        <TextInput value={filter} onChange={setFilter} placeholder="Filter components" aria-label="Filter components" />
      </div>
      <div className="cdc-palette-list" style={{ flex: 1, minHeight: 0, overflowY: "auto", position: "relative", padding: "0 10px 10px" }}>
        {groups.map((g) => (
          <section key={g.category} aria-label={g.category}>
            <div className="cdc-palette-group">{g.category}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {g.types.map((t) => (
                <PaletteEntry key={t} id={t} label={COMPONENT_LABELS[t]} onAdd={onAdd} />
              ))}
            </div>
          </section>
        ))}
        {groups.length === 0 && (
          <div style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued, padding: "12px 2px" }}>No component matches “{filter.trim()}”.</div>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          color: Colors.Text.Neutral.Subdued,
          lineHeight: 1.4,
          padding: "8px 10px",
          borderTop: `1px solid ${Colors.Border.Neutral.Default}`,
        }}
      >
        Double-click a node or connection to configure it. Drag from the dots on a node to connect it. Delete/Backspace
        removes the selection.
      </div>
    </div>
  );
}
