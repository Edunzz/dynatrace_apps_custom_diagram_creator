import React, { useState, type ReactNode } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Button } from "@dynatrace/strato-components/buttons";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import { MaximizeIcon, MinimizeIcon, XmarkIcon } from "@dynatrace/strato-icons";

export interface SidePanelProps {
  title: string;
  subtitle?: string;
  /** Extra header actions (e.g. a ⋮ menu), shown before the width toggle and close buttons. */
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

const WIDTH_DEFAULT = 460;
const WIDTH_WIDE = 760;

/**
 * Panel docked to the right of the canvas, like the tile editor in Dashboards: the diagram stays visible and
 * interactive while the panel is open.
 */
export function SidePanel({ title, subtitle, actions, onClose, children }: SidePanelProps) {
  const [wide, setWide] = useState(false);
  return (
    <aside
      className="cdc-side-panel"
      aria-label={title}
      style={{
        width: wide ? WIDTH_WIDE : WIDTH_DEFAULT,
        maxWidth: "60vw",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        borderLeft: `1px solid ${Colors.Border.Neutral.Default}`,
        background: Colors.Background.Surface.Default,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "12px 12px 8px 16px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 16, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={title}
          >
            {title}
          </div>
          {subtitle && <div style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>{subtitle}</div>}
        </div>
        {actions}
        <Tooltip text={wide ? "Panel estrecho" : "Panel ancho"}>
          <Button aria-label={wide ? "Panel estrecho" : "Panel ancho"} size="condensed" onClick={() => setWide((w) => !w)}>
            <Button.Prefix>{wide ? <MinimizeIcon /> : <MaximizeIcon />}</Button.Prefix>
          </Button>
        </Tooltip>
        <Tooltip text="Cerrar">
          <Button aria-label="Cerrar" size="condensed" onClick={onClose}>
            <Button.Prefix>
              <XmarkIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
      </div>
      <div className="cdc-side-panel-body" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
        {children}
      </div>
    </aside>
  );
}
