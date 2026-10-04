import React from "react";
import { Handle, Position } from "@xyflow/react";

/**
 * One handle per side. The canvas uses ConnectionMode.Loose, so any handle can be source or target;
 * the actual arrow direction is defined by the edge (forward / backward / none).
 */
export function NodeHandles({ connectable }: { connectable: boolean }) {
  return (
    <>
      <Handle id="t" type="source" position={Position.Top} isConnectable={connectable} />
      <Handle id="r" type="source" position={Position.Right} isConnectable={connectable} />
      <Handle id="b" type="source" position={Position.Bottom} isConnectable={connectable} />
      <Handle id="l" type="source" position={Position.Left} isConnectable={connectable} />
    </>
  );
}
