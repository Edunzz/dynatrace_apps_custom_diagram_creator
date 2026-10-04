import React, { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Modal } from "@dynatrace/strato-components/overlays";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { TextInput } from "@dynatrace/strato-components/forms";
import { showToast } from "@dynatrace/strato-components/notifications";
import type { Background, Diagram, NodeData, RefreshInterval } from "../model/schema";
import type { Timeframe } from "../model/types";
import { newCustomNodeData, newDiagram, newEntityNodeData } from "../model/defaults";
import { Canvas } from "../canvas/Canvas";
import { DiagramContext, useReducedMotion, type DiagramContextValue, type EditorMode } from "../canvas/DiagramContext";
import { autoLayout } from "../canvas/autoLayout";
import {
  CUSTOM_NODE_DEFAULT,
  fromFlowEdges,
  fromFlowNodes,
  toFlowEdges,
  toFlowNodes,
  type FlowEdge,
  type FlowNode,
} from "../canvas/flowTypes";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { useDiagramStatus } from "../hooks/useDiagramStatus";
import { useHistory } from "../hooks/useHistory";
import { errorMessage } from "../services/dql";
import { downloadJson, slugify } from "../services/download";
import {
  ConflictError,
  WARN_DIAGRAM_BYTES,
  byteLength,
  currentUser,
  encodePayload,
  getDiagram,
  newId,
  saveDiagram,
} from "../services/lookupStore";
import { DEFAULT_TIMEFRAME, REFRESH_MS } from "../services/time";
import { EditorToolbar } from "../toolbar/EditorToolbar";
import { PALETTE_MIME, Palette, type PaletteItem } from "../toolbar/Palette";
import { EdgeConfigPanel, type EdgeDraft } from "../panels/EdgeConfigPanel";
import { NodeConfigPanel } from "../panels/NodeConfigPanel";
import { NodeDetailDrawer, type DetailTarget } from "../panels/NodeDetailDrawer";

type Meta = Omit<Diagram, "nodes" | "edges" | "settings">;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function EditorInner({ diagramId }: { diagramId: string }) {
  const navigate = useNavigate();
  const rf = useReactFlow<FlowNode, FlowEdge>();
  const reducedMotion = useReducedMotion();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [initialViewport, setInitialViewport] = useState<Diagram["settings"]["viewport"]>();
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | undefined>();
  const [persisted, setPersisted] = useState(false);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<FlowEdge>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>(DEFAULT_TIMEFRAME);
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>("off");
  const [background, setBackground] = useState<Background>("dots");
  const [mode, setMode] = useState<EditorMode>("view");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configNodeId, setConfigNodeId] = useState<string | null>(null);
  const [configEdgeId, setConfigEdgeId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ kind: "node" | "edge"; id: string } | null>(null);
  const [conflict, setConflict] = useState<ConflictError | null>(null);
  const [saveAsName, setSaveAsName] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const loadedIdRef = useRef<string | null>(null);

  // ---------- loading ----------
  const applyDiagram = useCallback(
    (d: Diagram) => {
      const { nodes: dn, edges: de, settings, ...rest } = d;
      setMeta(rest);
      setNodes(toFlowNodes(dn));
      setEdges(toFlowEdges(de));
      setTimeframe(settings.defaultTimeframe);
      setRefreshInterval(settings.refreshInterval);
      setBackground(settings.background);
      setInitialViewport(settings.viewport);
      loadedIdRef.current = d.id;
    },
    [setNodes, setEdges],
  );

  const load = useCallback(
    async (id: string) => {
      setLoading(true);
      setLoadError(null);
      try {
        const { diagram, updatedAt } = await getDiagram(id);
        applyDiagram(diagram);
        setLoadedUpdatedAt(updatedAt);
        setPersisted(true);
        setDirty(false);
      } catch (e) {
        setLoadError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [applyDiagram],
  );

  useEffect(() => {
    if (loadedIdRef.current === diagramId) {
      return; // already loaded (e.g. after saving a new diagram and changing the URL)
    }
    if (diagramId === "new") {
      applyDiagram(newDiagram(newId(), "Nuevo diagrama", currentUser()));
      loadedIdRef.current = "new";
      setPersisted(false);
      setLoadedUpdatedAt(undefined);
      setMode("edit");
      setDirty(false);
      setLoading(false);
      return;
    }
    setMode("view");
    void load(diagramId);
  }, [diagramId, applyDiagram, load]);

  // ---------- live status ----------
  const getElements = useCallback(
    () => ({ nodes: fromFlowNodes(nodesRef.current), edges: fromFlowEdges(edgesRef.current) }),
    [],
  );
  const { status, refresh, refreshing } = useDiagramStatus(getElements, timeframe, !loading && !loadError && meta !== null);
  useAutoRefresh(REFRESH_MS[refreshInterval] ?? null, () => void refresh());

  // ---------- history ----------
  const history = useHistory(
    useCallback(() => ({ nodes: nodesRef.current, edges: edgesRef.current }), []),
    useCallback(
      (snap: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
        setNodes(snap.nodes);
        setEdges(snap.edges);
        setDirty(true);
      },
      [setNodes, setEdges],
    ),
  );

  // History belongs to one diagram: it is cleared when another is loaded.
  const resetHistory = history.reset;
  useEffect(() => {
    resetHistory();
  }, [meta?.id, resetHistory]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== "edit" || isTypingTarget(e.target) || !(e.ctrlKey || e.metaKey)) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, history]);

  // Warn when leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) {
      return undefined;
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ---------- canvas changes ----------
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      onNodesChangeBase(changes);
      if (
        changes.some(
          (c) =>
            (c.type === "position" && c.dragging) ||
            (c.type === "dimensions" && c.resizing) ||
            c.type === "remove" ||
            c.type === "add",
        )
      ) {
        setDirty(true);
      }
    },
    [onNodesChangeBase],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      onEdgesChangeBase(changes);
      if (changes.some((c) => c.type === "remove" || c.type === "add")) {
        setDirty(true);
      }
    },
    [onEdgesChangeBase],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) {
        return;
      }
      history.record();
      const id = `e-${newId().slice(0, 8)}`;
      setEdges((eds) => addEdge({ ...connection, id, type: "normal", data: { direction: "forward" } }, eds));
      setDirty(true);
      // On connect, the type is chosen: Normal or KPI relation.
      setConfigEdgeId(id);
    },
    [history, setEdges],
  );

  const addNodeAt = useCallback(
    (item: PaletteItem, position: { x: number; y: number }) => {
      history.record();
      const id = `n-${newId().slice(0, 8)}`;
      const node: FlowNode =
        item === "custom"
          ? {
              id,
              type: "customNode",
              position,
              data: newCustomNodeData(),
              width: CUSTOM_NODE_DEFAULT.w,
              height: CUSTOM_NODE_DEFAULT.h,
            }
          : { id, type: "entityNode", position, data: newEntityNodeData(item) };
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...node, selected: true }]);
      setDirty(true);
      setConfigNodeId(id);
    },
    [history, setNodes],
  );

  const onDropItem = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const item = event.dataTransfer.getData(PALETTE_MIME) as PaletteItem;
      if (!item) {
        return;
      }
      event.preventDefault();
      addNodeAt(item, rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addNodeAt, rf],
  );

  const onPaletteAdd = useCallback(
    (item: PaletteItem) => {
      const el = document.querySelector(".cdc-canvas");
      const rect = el?.getBoundingClientRect();
      const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 400, y: 300 };
      addNodeAt(item, rf.screenToFlowPosition(center));
    },
    [addNodeAt, rf],
  );

  // ---------- panels ----------
  const applyNodeConfig = useCallback(
    (id: string, data: NodeData) => {
      history.record();
      setNodes((ns) =>
        ns.map((n): FlowNode => {
          if (n.id !== id) {
            return n;
          }
          return data.kind === "entity"
            ? { ...n, type: "entityNode", data }
            : { ...n, type: "customNode", data };
        }),
      );
      setDirty(true);
      setConfigNodeId(null);
      // Recompute only that node, after the state change is applied.
      setTimeout(() => void refresh({ nodeIds: [id] }), 0);
    },
    [history, setNodes, refresh],
  );

  const applyEdgeConfig = useCallback(
    (id: string, draft: EdgeDraft) => {
      history.record();
      setEdges((es) =>
        es.map((e) =>
          e.id === id
            ? { ...e, type: draft.type, data: { direction: draft.direction, label: draft.label, kpi: draft.type === "kpi" ? draft.kpi : undefined } }
            : e,
        ),
      );
      setDirty(true);
      setConfigEdgeId(null);
      if (draft.type === "kpi") {
        setTimeout(() => void refresh({ edgeIds: [id] }), 0);
      }
    },
    [history, setEdges, refresh],
  );

  const deleteNode = useCallback(
    (id: string) => {
      history.record();
      void rf.deleteElements({ nodes: [{ id }] });
      setDirty(true);
      setConfigNodeId(null);
    },
    [history, rf],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      history.record();
      void rf.deleteElements({ edges: [{ id }] });
      setDirty(true);
      setConfigEdgeId(null);
    },
    [history, rf],
  );

  // ---------- save / export ----------
  const buildDiagram = useCallback((): Diagram | null => {
    if (!meta) {
      return null;
    }
    return {
      ...meta,
      settings: { background, defaultTimeframe: timeframe, refreshInterval, viewport: rf.getViewport() },
      nodes: fromFlowNodes(rf.getNodes()),
      edges: fromFlowEdges(rf.getEdges()),
    };
  }, [meta, background, timeframe, refreshInterval, rf]);

  const warnIfLarge = (d: Diagram) => {
    const bytes = byteLength(encodePayload(d));
    if (bytes > WARN_DIAGRAM_BYTES) {
      showToast({
        type: "warning",
        title: "Diagrama muy grande",
        message: `Ocupa ${(bytes / 1024 / 1024).toFixed(1)} MB en el lookup table (límite total del archivo: 100 MB).`,
      });
    }
  };

  const doSave = useCallback(
    async (force = false) => {
      const d = buildDiagram();
      if (!d) {
        return;
      }
      if (!d.name.trim()) {
        showToast({ type: "warning", title: "El diagrama necesita un nombre" });
        return;
      }
      setSaving(true);
      try {
        warnIfLarge(d);
        const saved = await saveDiagram(d, { expectedUpdatedAt: persisted ? loadedUpdatedAt : undefined, force });
        setMeta((m) => (m ? { ...m, updatedAt: saved.updatedAt } : m));
        setLoadedUpdatedAt(saved.updatedAt);
        setPersisted(true);
        setDirty(false);
        setConflict(null);
        showToast({ type: "success", title: "Diagrama guardado", lifespan: 3000 });
        if (diagramId !== saved.id) {
          loadedIdRef.current = saved.id;
          navigate(`/diagram/${saved.id}`, { replace: true });
        }
      } catch (e) {
        if (e instanceof ConflictError) {
          setConflict(e);
        } else {
          showToast({ type: "critical", title: "No se pudo guardar", message: errorMessage(e), lifespan: "infinite" });
        }
      } finally {
        setSaving(false);
      }
    },
    [buildDiagram, persisted, loadedUpdatedAt, diagramId, navigate],
  );

  const doSaveAs = useCallback(
    async (name: string) => {
      const d = buildDiagram();
      if (!d) {
        return;
      }
      const now = new Date().toISOString();
      const copy: Diagram = { ...d, id: newId(), name, owner: currentUser(), createdAt: now, updatedAt: now };
      setSaving(true);
      try {
        warnIfLarge(copy);
        const saved = await saveDiagram(copy);
        setSaveAsName(null);
        setMeta({ ...copy, updatedAt: saved.updatedAt });
        setLoadedUpdatedAt(saved.updatedAt);
        setPersisted(true);
        setDirty(false);
        loadedIdRef.current = saved.id;
        showToast({ type: "success", title: `Guardado como «${name}»`, lifespan: 3000 });
        navigate(`/diagram/${saved.id}`, { replace: true });
      } catch (e) {
        showToast({ type: "critical", title: "No se pudo guardar", message: errorMessage(e), lifespan: "infinite" });
      } finally {
        setSaving(false);
      }
    },
    [buildDiagram, navigate],
  );

  const doExport = useCallback(() => {
    const d = buildDiagram();
    if (d) {
      downloadJson(`${slugify(d.name)}.json`, d);
    }
  }, [buildDiagram]);

  const doAutoLayout = useCallback(() => {
    history.record();
    setNodes((ns) => autoLayout(ns, edgesRef.current));
    setDirty(true);
    setTimeout(() => void rf.fitView({ padding: 0.15, duration: 300 }), 50);
  }, [history, setNodes, rf]);

  const goBack = useCallback(() => {
    if (dirty) {
      setLeaveOpen(true);
    } else {
      navigate("/");
    }
  }, [dirty, navigate]);

  // ---------- context for nodes and edges ----------
  const contextValue = useMemo<DiagramContextValue>(
    () => ({
      status,
      mode,
      reducedMotion,
      openDetail: (kind, id) => setDetail({ kind, id }),
      openConfig: (kind, id) => (kind === "node" ? setConfigNodeId(id) : setConfigEdgeId(id)),
    }),
    [status, mode, reducedMotion],
  );

  const configNode = configNodeId ? nodes.find((n) => n.id === configNodeId) : undefined;
  const configEdge = configEdgeId ? edges.find((e) => e.id === configEdgeId) : undefined;
  const edgeDraft = useMemo<EdgeDraft | null>(
    () =>
      configEdge
        ? {
            type: configEdge.type === "kpi" ? "kpi" : "normal",
            direction: configEdge.data?.direction ?? "forward",
            label: configEdge.data?.label,
            kpi: configEdge.data?.kpi,
          }
        : null,
    [configEdge],
  );

  const detailTarget: DetailTarget = useMemo(() => {
    if (!detail) {
      return null;
    }
    if (detail.kind === "node") {
      const n = nodes.find((x) => x.id === detail.id);
      return n ? { kind: "node", node: fromFlowNodes([n])[0] } : null;
    }
    const e = edges.find((x) => x.id === detail.id);
    return e ? { kind: "edge", edge: fromFlowEdges([e])[0] } : null;
  }, [detail, nodes, edges]);

  if (loading) {
    return (
      <Flex justifyContent="center" alignItems="center" style={{ height: "100%" }}>
        <ProgressCircle aria-label="Cargando diagrama" />
      </Flex>
    );
  }
  if (loadError || !meta) {
    return (
      <Flex flexDirection="column" alignItems="center" justifyContent="center" gap={12} style={{ height: "100%" }}>
        <span>No se pudo abrir el diagrama: {loadError}</span>
        <Button onClick={() => navigate("/")}>Volver a la lista</Button>
      </Flex>
    );
  }

  return (
    <DiagramContext.Provider value={contextValue}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        <EditorToolbar
          name={meta.name}
          onNameChange={(name) => {
            setMeta({ ...meta, name });
            setDirty(true);
          }}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          refreshInterval={refreshInterval}
          onRefreshIntervalChange={setRefreshInterval}
          onRefresh={() => void refresh()}
          refreshing={refreshing}
          lastUpdated={status.lastUpdated}
          background={background}
          onBackgroundChange={(b) => {
            setBackground(b);
            setDirty(true);
          }}
          mode={mode}
          onModeChange={setMode}
          dirty={dirty}
          saving={saving}
          onSave={() => void doSave()}
          onSaveAs={() => setSaveAsName(`${meta.name} (copia)`)}
          onExport={doExport}
          onAutoLayout={doAutoLayout}
          onUndo={history.undo}
          onRedo={history.redo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onBack={goBack}
        />
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {mode === "edit" && <Palette onAdd={onPaletteAdd} />}
          <Canvas
            nodes={nodes}
            edges={edges}
            background={background}
            defaultViewport={initialViewport}
            status={status}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStart={history.record}
            onBeforeDelete={() => {
              history.record();
              return Promise.resolve(true);
            }}
            onDropItem={onDropItem}
          />
        </div>
      </div>

      <NodeConfigPanel
        nodeId={configNode ? configNode.id : null}
        data={configNode ? configNode.data : null}
        timeframe={timeframe}
        onApply={applyNodeConfig}
        onDelete={deleteNode}
        onClose={() => setConfigNodeId(null)}
      />
      <EdgeConfigPanel
        edgeId={configEdge ? configEdge.id : null}
        value={edgeDraft}
        timeframe={timeframe}
        onApply={applyEdgeConfig}
        onDelete={deleteEdge}
        onClose={() => setConfigEdgeId(null)}
      />
      <NodeDetailDrawer
        target={detailTarget}
        nodeStatus={detail?.kind === "node" ? status.nodes[detail.id] : undefined}
        edgeStatus={detail?.kind === "edge" ? status.edges[detail.id] : undefined}
        tf={status.resolvedTimeframe}
        onClose={() => setDetail(null)}
      />

      <Modal
        title="El diagrama fue modificado por otro usuario"
        show={conflict !== null}
        onDismiss={() => setConflict(null)}
        footer={
          <Flex gap={8} justifyContent="flex-end">
            <Button
              onClick={() => {
                setConflict(null);
                void load(meta.id);
              }}
            >
              Recargar
            </Button>
            <Button color="critical" variant="emphasized" onClick={() => void doSave(true)} loading={saving}>
              Sobrescribir
            </Button>
          </Flex>
        }
      >
        {conflict && (
          <span>
            Última modificación: {conflict.current.updatedAt} por {conflict.current.owner || "desconocido"}. «Recargar» descarta
            tus cambios; «Sobrescribir» reemplaza la versión guardada.
          </span>
        )}
      </Modal>

      <Modal
        title="Guardar como"
        show={saveAsName !== null}
        onDismiss={() => setSaveAsName(null)}
        footer={
          <Flex gap={8} justifyContent="flex-end">
            <Button onClick={() => setSaveAsName(null)}>Cancelar</Button>
            <Button
              variant="accent"
              color="primary"
              loading={saving}
              disabled={!saveAsName?.trim()}
              onClick={() => saveAsName && void doSaveAs(saveAsName.trim())}
            >
              Guardar
            </Button>
          </Flex>
        }
      >
        <TextInput value={saveAsName ?? ""} onChange={(v) => setSaveAsName(v)} aria-label="Nombre del nuevo diagrama" />
      </Modal>

      <Modal
        title="Hay cambios sin guardar"
        show={leaveOpen}
        onDismiss={() => setLeaveOpen(false)}
        footer={
          <Flex gap={8} justifyContent="flex-end">
            <Button onClick={() => setLeaveOpen(false)}>Seguir editando</Button>
            <Button color="critical" onClick={() => navigate("/")}>
              Salir sin guardar
            </Button>
          </Flex>
        }
      >
        Si sales ahora perderás los cambios.
      </Modal>
    </DiagramContext.Provider>
  );
}

export function DiagramEditorPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <ReactFlowProvider>
      <EditorInner diagramId={id ?? "new"} />
    </ReactFlowProvider>
  );
}
