import React, { type ReactNode } from "react";
import { NodeResizeControl, NodeToolbar, Position, useInternalNode } from "@xyflow/react";
import { Button } from "@dynatrace/strato-components/buttons";
import { Menu } from "@dynatrace/strato-components/navigation";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import { DeleteIcon, DotMenuIcon, DuplicateIcon, EditIcon, InformationIcon } from "@dynatrace/strato-icons";
import { useDiagramContext } from "../DiagramContext";

export function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip text={label}>
      <Button aria-label={label} size="condensed" onClick={onClick}>
        <Button.Prefix>{children}</Button.Prefix>
      </Button>
    </Tooltip>
  );
}

/** Diagonal grip drawn in the bottom corners, like the resize handles of dashboard tiles. */
function CornerGrip({ mirrored }: { mirrored?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={mirrored ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M11 3 L3 11 M11 7 L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Edit-mode chrome shared by every node (like dashboard tiles):
 * a floating toolbar above the selected node (size, duplicate, edit, more) and resize grips in the bottom corners.
 */
export function NodeChrome({ id, selected, minWidth, minHeight }: { id: string; selected: boolean; minWidth: number; minHeight: number }) {
  const { mode, openConfig, openDetail, duplicateNode, deleteElement } = useDiagramContext();
  const internal = useInternalNode(id);
  if (mode !== "edit") {
    return null;
  }
  const w = Math.round(internal?.measured.width ?? 0);
  const h = Math.round(internal?.measured.height ?? 0);
  return (
    <>
      <NodeToolbar isVisible={selected} position={Position.Top} align="start" offset={8} className="cdc-floating-toolbar nodrag nopan">
        <span className="cdc-size-badge" aria-label="Size">
          {w} × {h}
        </span>
        <ToolbarButton label="Duplicate" onClick={() => duplicateNode(id)}>
          <DuplicateIcon />
        </ToolbarButton>
        <ToolbarButton label="Edit" onClick={() => openConfig("node", id)}>
          <EditIcon />
        </ToolbarButton>
        <Menu>
          <Menu.Trigger>
            <Button aria-label="More actions" size="condensed">
              <Button.Prefix>
                <DotMenuIcon />
              </Button.Prefix>
            </Button>
          </Menu.Trigger>
          <Menu.Content>
            <Menu.Item onSelect={() => openDetail("node", id)}>
              <Menu.Prefix>
                <InformationIcon />
              </Menu.Prefix>
              View details
            </Menu.Item>
            <Menu.Item onSelect={() => deleteElement("node", id)}>
              <Menu.Prefix>
                <DeleteIcon />
              </Menu.Prefix>
              Delete
            </Menu.Item>
          </Menu.Content>
        </Menu>
      </NodeToolbar>
      {selected && (
        <>
          <NodeResizeControl position="bottom-left" minWidth={minWidth} minHeight={minHeight} className="cdc-resize-corner">
            <CornerGrip mirrored />
          </NodeResizeControl>
          <NodeResizeControl position="bottom-right" minWidth={minWidth} minHeight={minHeight} className="cdc-resize-corner">
            <CornerGrip />
          </NodeResizeControl>
        </>
      )}
    </>
  );
}
