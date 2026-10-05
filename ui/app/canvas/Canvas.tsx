import React, { useState, type DragEvent } from "react";
import {
  Background as FlowBackground,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./canvas.css";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useCurrentTheme } from "@dynatrace/strato-components/core";
import type { Background } from "../model/schema";
import type { DiagramStatus } from "../model/types";
import { useDiagramContext } from "./DiagramContext";
import type { FlowEdge, FlowNode } from "./flowTypes";
import { STATUS_COLOR } from "./statusStyle";
import { CustomNode } from "./nodes/CustomNode";
import { EntityNode } from "./nodes/EntityNode";
import { KpiEdge } from "./edges/KpiEdge";
import { NormalEdge } from "./edges/NormalEdge";

// Defined outside the component so React Flow doesn't re-register them on every render.
const nodeTypes = { entityNode: EntityNode, customNode: CustomNode };
const edgeTypes = { normal: NormalEdge, kpi: KpiEdge };
const SNAP_GRID: [number, number] = [16, 16];

export interface CanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  background: Background;
  defaultViewport?: Viewport;
  status: DiagramStatus;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  /** An end of a connection was dropped on another handle (same or different node). */
  onReconnect: (edge: FlowEdge, connection: Connection) => void;
  onNodeDragStart: () => void;
  onBeforeDelete: () => Promise<boolean>;
  onDropItem: (event: DragEvent<HTMLDivElement>) => void;
  /** Click on a node or connection in edit mode (selection). */
  onSelectElement?: (kind: "node" | "edge", id: string) => void;
}

export function Canvas(props: CanvasProps) {
  const { mode, openConfig, openDetail } = useDiagramContext();
  const theme = useCurrentTheme();
  const [connecting, setConnecting] = useState(false);
  const edit = mode === "edit";

  return (
    <div
      className={`cdc-canvas ${edit ? "cdc-edit" : "cdc-view"}${connecting ? " cdc-connecting" : ""}`}
      style={{ flex: 1, minWidth: 0, height: "100%", position: "relative" }}
      onDragOver={(e) => {
        if (edit) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => {
        if (edit) {
          props.onDropItem(e);
        }
      }}
    >
      <ReactFlow<FlowNode, FlowEdge>
        nodes={props.nodes}
        edges={props.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={props.onNodesChange}
        onEdgesChange={props.onEdgesChange}
        onConnect={props.onConnect}
        onConnectStart={() => setConnecting(true)}
        onConnectEnd={() => setConnecting(false)}
        edgesReconnectable={edit}
        reconnectRadius={12}
        onReconnect={edit ? props.onReconnect : undefined}
        onReconnectStart={() => setConnecting(true)}
        onReconnectEnd={() => setConnecting(false)}
        onNodeDragStart={props.onNodeDragStart}
        onBeforeDelete={props.onBeforeDelete}
        onNodeClick={(_, node) => {
          if (edit) {
            props.onSelectElement?.("node", node.id);
          } else {
            openDetail("node", node.id);
          }
        }}
        onNodeDoubleClick={(_, node) => (edit ? openConfig("node", node.id) : openDetail("node", node.id))}
        onEdgeClick={(_, edge) => {
          if (edit) {
            props.onSelectElement?.("edge", edge.id);
          } else {
            openDetail("edge", edge.id);
          }
        }}
        onEdgeDoubleClick={(_, edge) => (edit ? openConfig("edge", edge.id) : openDetail("edge", edge.id))}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={edit}
        nodesConnectable={edit}
        elementsSelectable
        edgesFocusable={edit}
        deleteKeyCode={edit ? ["Delete", "Backspace"] : null}
        snapToGrid={props.background !== "blank"}
        snapGrid={SNAP_GRID}
        defaultViewport={props.defaultViewport}
        fitView={!props.defaultViewport}
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={3}
        colorMode={theme}
        proOptions={{ hideAttribution: false }}
      >
        {props.background === "dots" && <FlowBackground variant={BackgroundVariant.Dots} gap={16} size={1.5} />}
        {props.background === "grid" && <FlowBackground variant={BackgroundVariant.Lines} gap={32} />}
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap<FlowNode>
          pannable
          zoomable
          nodeColor={(n) => STATUS_COLOR[props.status.nodes[n.id]?.status ?? "loading"]}
          nodeStrokeColor={Colors.Border.Neutral.Accent}
          maskColor={Colors.Background.Surface.Backdrop}
        />
      </ReactFlow>
      {props.nodes.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            color: Colors.Text.Neutral.Subdued,
            fontSize: 15,
          }}
        >
          {edit ? "Add your first component from the palette" : "This diagram is empty. Switch to \"Edit\" to add components."}
        </div>
      )}
    </div>
  );
}
