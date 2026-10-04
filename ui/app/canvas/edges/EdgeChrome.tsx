import React from "react";
import { EdgeToolbar } from "@xyflow/react";
import { DeleteIcon, EditIcon } from "@dynatrace/strato-icons";
import { useDiagramContext } from "../DiagramContext";
import { ToolbarButton } from "../nodes/NodeChrome";

/** Floating toolbar above a selected connection in edit mode (edit, delete). */
export function EdgeChrome({ id, selected, x, y }: { id: string; selected: boolean; x: number; y: number }) {
  const { mode, openConfig, deleteElement } = useDiagramContext();
  if (mode !== "edit") {
    return null;
  }
  return (
    <EdgeToolbar edgeId={id} x={x} y={y - 22} isVisible={selected} alignY="bottom" className="cdc-floating-toolbar nodrag nopan">
      <ToolbarButton label="Edit" onClick={() => openConfig("edge", id)}>
        <EditIcon />
      </ToolbarButton>
      <ToolbarButton label="Delete" onClick={() => deleteElement("edge", id)}>
        <DeleteIcon />
      </ToolbarButton>
    </EdgeToolbar>
  );
}
