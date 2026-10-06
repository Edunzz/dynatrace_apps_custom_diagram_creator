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
  ENTITY_NODE_WIDTH,
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
import { EdgeConfigPanel, type EdgeDraft, type EdgeEnds } from "../panels/EdgeConfigPanel";
import { NodeConfigPanel, type CommitMode } from "../panels/NodeConfigPanel";
import { NodeDetailDrawer, type DetailTarget } from "../panels/NodeDetailDrawer";

type Meta = Omit<Diagram, "nodes" | "edges" | "settings">;

type ElementKind = "node" | "edge";

/** What the docked right panel shows: the editor of an element (edit mode) or its detail (view mode). */
interface PanelTarget {
  mode: "config" | "detail";
  kind: ElementKind;
  id: string;
}

/** Delay before recalculating the status after a threshold or filter change in the panel. */
const COMMIT_DEBOUNCE_MS = 900;
/** Offset of a duplicated node. */
const DUPLICATE_OFFSET = 32;

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
  const [contentDirty, setDirty] = useState(false);
  // Timeframe and auto-refresh as last loaded or saved: they are saved with the diagram, so changing them is an
  // unsaved change too (and returning to the saved values isn't).
  const [savedView, setSavedView] = useState<{ timeframe: Timeframe; refreshInterval: RefreshInterval }>({
    timeframe: DEFAULT_TIMEFRAME,
    refreshInterval: "off",
  });
  const viewDirty =
    timeframe.from !== savedView.timeframe.from ||
    timeframe.to !== savedView.timeframe.to ||
    refreshInterval !== savedView.refreshInterval;
  const dirty = contentDirty || viewDirty;
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<PanelTarget | null>(null);
  // Bumped on undo/redo so an open editor panel remounts with the restored data.
  const [panelVersion, setPanelVersion] = useState(0);
  const [conflict, setConflict] = useState<ConflictError | null>(null);
  const [saveAsName, setSaveAsName] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const loadedIdRef = useRef<string | null>(null);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  // One undo step per panel session, and whether its last changes still need a status refresh.
  const sessionRef = useRef({ recorded: false, pending: false });
  const commitTimerRef = useRef<number | undefined>(undefined);

  // ---------- loading ----------
  const applyDiagram = useCallback(
    (d: Diagram) => {
      const { nodes: dn, edges: de, settings, ...rest } = d;
      setMeta(rest);
      setNodes(toFlowNodes(dn));
      setEdges(toFlowEdges(de));
      setTimeframe(settings.defaultTimeframe);
      setRefreshInterval(settings.refreshInterval);
      setSavedView({ timeframe: settings.defaultTimeframe, refreshInterval: settings.refreshInterval });
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
      applyDiagram(newDiagram(newId(), "New diagram", currentUser()));
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

  const recordHistory = history.record;
  // After undo/redo the open panel remounts with the restored data, and its next change is a new undo step.
  const undo = useCallback(() => {
    history.undo();
    sessionRef.current.recorded = false;
    setPanelVersion((v) => v + 1);
  }, [history]);
  const redo = useCallback(() => {
    history.redo();
    sessionRef.current.recorded = false;
    setPanelVersion((v) => v + 1);
  }, [history]);

  // ---------- docked panel ----------
  const refreshElement = useCallback(
    (kind: ElementKind, id: string) => {
      // After the state update has been applied, so the status engine reads the new definition.
      window.setTimeout(() => void refresh(kind === "node" ? { nodeIds: [id] } : { edgeIds: [id] }), 0);
    },
    [refresh],
  );

  /** Ends the current panel session: pending changes get their status refreshed. */
  const flushSession = useCallback(() => {
    window.clearTimeout(commitTimerRef.current);
    const current = panelRef.current;
    if (current?.mode === "config" && sessionRef.current.pending) {
      refreshElement(current.kind, current.id);
    }
    sessionRef.current = { recorded: false, pending: false };
  }, [refreshElement]);

  const openPanel = useCallback(
    (next: PanelTarget | null) => {
      const current = panelRef.current;
      if (current && next && current.mode === next.mode && current.kind === next.kind && current.id === next.id) {
        return;
      }
      flushSession();
      setPanel(next);
      // The element being edited becomes the selection, so its floating toolbar shows as well.
      if (next?.mode === "config") {
        setNodes((ns) =>
          ns.map((n) => {
            const want = next.kind === "node" && n.id === next.id;
            return Boolean(n.selected) === want ? n : { ...n, selected: want };
          }),
        );
        setEdges((es) =>
          es.map((e) => {
            const want = next.kind === "edge" && e.id === next.id;
            return Boolean(e.selected) === want ? e : { ...e, selected: want };
          }),
        );
      }
    },
    [flushSession, setNodes, setEdges],
  );

  const recordOnce = useCallback(() => {
    if (!sessionRef.current.recorded) {
      recordHistory();
      sessionRef.current.recorded = true;
    }
  }, [recordHistory]);

  const commitChange = useCallback(
    (kind: ElementKind, id: string, commit: CommitMode) => {
      sessionRef.current.pending = true;
      if (commit === "none") {
        return;
      }
      window.clearTimeout(commitTimerRef.current);
      const run = () => {
        sessionRef.current.pending = false;
        refreshElement(kind, id);
      };
      if (commit === "now") {
        run();
      } else {
        commitTimerRef.current = window.setTimeout(run, COMMIT_DEBOUNCE_MS);
      }
    },
    [refreshElement],
  );

  /** Live update from the node editor panel (no Apply button, like dashboard tiles). */
  const changeNode = useCallback(
    (id: string, data: NodeData, commit: CommitMode) => {
      recordOnce();
      setNodes((ns) =>
        ns.map((n): FlowNode => {
          if (n.id !== id) {
            return n;
          }
          return data.kind === "entity" ? { ...n, type: "entityNode", data } : { ...n, type: "customNode", data };
        }),
      );
      setDirty(true);
      commitChange("node", id, commit);
    },
    [recordOnce, setNodes, commitChange],
  );

  /** Live update from the connection editor panel. */
  const changeEdge = useCallback(
    (id: string, draft: EdgeDraft, commit: CommitMode) => {
      recordOnce();
      setEdges((es) =>
        es.map((e) =>
          e.id === id
            ? {
                ...e,
                type: draft.type,
                data: { direction: draft.direction, label: draft.label, kpi: draft.type === "kpi" ? draft.kpi : undefined },
              }
            : e,
        ),
      );
      setDirty(true);
      commitChange("edge", id, commit);
    },
    [recordOnce, setEdges, commitChange],
  );

  const changeEdgeEnds = useCallback(
    (id: string, ends: EdgeEnds) => {
      recordOnce();
      setEdges((es) =>
        es.map((e) => (e.id === id ? { ...e, sourceHandle: ends.sourceHandle ?? null, targetHandle: ends.targetHandle ?? null } : e)),
      );
      setDirty(true);
    },
    [recordOnce, setEdges],
  );

  const deleteElement = useCallback(
    (kind: ElementKind, id: string) => {
      recordHistory();
      void rf.deleteElements(kind === "node" ? { nodes: [{ id }] } : { edges: [{ id }] });
      setDirty(true);
      if (panelRef.current?.id === id) {
        window.clearTimeout(commitTimerRef.current);
        sessionRef.current = { recorded: false, pending: false };
        setPanel(null);
      }
    },
    [recordHistory, rf],
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const source = nodesRef.current.find((n) => n.id === id);
      if (!source) {
        return;
      }
      recordHistory();
      const copyId = `n-${newId().slice(0, 8)}`;
      const copy = {
        ...source,
        id: copyId,
        position: { x: source.position.x + DUPLICATE_OFFSET, y: source.position.y + DUPLICATE_OFFSET },
        data: structuredClone(source.data),
        selected: true,
      } as FlowNode;
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), copy]);
      setDirty(true);
      refreshElement("node", copyId);
    },
    [recordHistory, setNodes, refreshElement],
  );

  // If the element shown in the panel disappears (keyboard delete, undo), the panel closes.
  useEffect(() => {
    if (!panel) {
      return;
    }
    const exists = panel.kind === "node" ? nodes.some((n) => n.id === panel.id) : edges.some((e) => e.id === panel.id);
    if (!exists) {
      sessionRef.current = { recorded: false, pending: false };
      setPanel(null);
    }
  }, [panel, nodes, edges]);

  const changeMode = useCallback(
    (next: EditorMode) => {
      openPanel(null);
      setMode(next);
    },
    [openPanel],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== "edit" || isTypingTarget(e.target) || !(e.ctrlKey || e.metaKey)) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, undo, redo]);

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
      recordHistory();
      const id = `e-${newId().slice(0, 8)}`;
      setEdges((eds) => addEdge({ ...connection, id, type: "normal", data: { direction: "forward" } }, eds));
      setDirty(true);
      // On connect, the type is chosen in the panel: Normal or KPI relation.
      openPanel({ mode: "config", kind: "edge", id });
    },
    [recordHistory, setEdges, openPanel],
  );

  // Dragging an end of a connection onto another handle moves that end; the connection keeps its id and settings.
  const onReconnect = useCallback(
    (oldEdge: FlowEdge, connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return;
      }
      recordHistory();
      setEdges((es) =>
        es.map((e) =>
          e.id === oldEdge.id
            ? {
                ...e,
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle ?? null,
                targetHandle: connection.targetHandle ?? null,
              }
            : e,
        ),
      );
      setDirty(true);
    },
    [recordHistory, setEdges],
  );

  const addNodeAt = useCallback(
    (item: PaletteItem, position: { x: number; y: number }) => {
      recordHistory();
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
          : { id, type: "entityNode", position, data: newEntityNodeData(item), width: ENTITY_NODE_WIDTH };
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...node, selected: true }]);
      setDirty(true);
      openPanel({ mode: "config", kind: "node", id });
    },
    [recordHistory, setNodes, openPanel],
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
        title: "Diagram is very large",
        message: `It takes up ${(bytes / 1024 / 1024).toFixed(1)} MB in the lookup table (total file limit: 100 MB).`,
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
        showToast({ type: "warning", title: "The diagram needs a name" });
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
        setSavedView({ timeframe: d.settings.defaultTimeframe, refreshInterval: d.settings.refreshInterval });
        setConflict(null);
        showToast({ type: "success", title: "Diagram saved", lifespan: 3000 });
        if (diagramId !== saved.id) {
          loadedIdRef.current = saved.id;
          navigate(`/diagram/${saved.id}`, { replace: true });
        }
      } catch (e) {
        if (e instanceof ConflictError) {
          setConflict(e);
        } else {
          showToast({ type: "critical", title: "Couldn't save", message: errorMessage(e), lifespan: "infinite" });
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
        setSavedView({ timeframe: copy.settings.defaultTimeframe, refreshInterval: copy.settings.refreshInterval });
        loadedIdRef.current = saved.id;
        showToast({ type: "success", title: `Saved as "${name}"`, lifespan: 3000 });
        navigate(`/diagram/${saved.id}`, { replace: true });
      } catch (e) {
        showToast({ type: "critical", title: "Couldn't save", message: errorMessage(e), lifespan: "infinite" });
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
    recordHistory();
    setNodes((ns) => autoLayout(ns, edgesRef.current));
    setDirty(true);
    setTimeout(() => void rf.fitView({ padding: 0.15, duration: 300 }), 50);
  }, [recordHistory, setNodes, rf]);

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
      editingId: panel?.mode === "config" ? panel.id : undefined,
      reducedMotion,
      openDetail: (kind, id) => openPanel({ mode: "detail", kind, id }),
      openConfig: (kind, id) => openPanel({ mode: "config", kind, id }),
      duplicateNode,
      deleteElement,
    }),
    [status, mode, panel, reducedMotion, openPanel, duplicateNode, deleteElement],
  );

  const configNode = panel?.mode === "config" && panel.kind === "node" ? nodes.find((n) => n.id === panel.id) : undefined;
  const configEdge = panel?.mode === "config" && panel.kind === "edge" ? edges.find((e) => e.id === panel.id) : undefined;
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
    if (panel?.mode !== "detail") {
      return null;
    }
    if (panel.kind === "node") {
      const n = nodes.find((x) => x.id === panel.id);
      return n ? { kind: "node", node: fromFlowNodes([n])[0] } : null;
    }
    const e = edges.find((x) => x.id === panel.id);
    return e ? { kind: "edge", edge: fromFlowEdges([e])[0] } : null;
  }, [panel, nodes, edges]);

  if (loading) {
    return (
      <Flex justifyContent="center" alignItems="center" style={{ height: "100%" }}>
        <ProgressCircle aria-label="Loading diagram" />
      </Flex>
    );
  }
  if (loadError || !meta) {
    return (
      <Flex flexDirection="column" alignItems="center" justifyContent="center" gap={12} style={{ height: "100%" }}>
        <span>Couldn't open the diagram: {loadError}</span>
        <Button onClick={() => navigate("/")}>Back to list</Button>
      </Flex>
    );
  }

  return (
    <DiagramContext.Provider value={contextValue}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "clip", position: "relative" }}>
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
          onModeChange={changeMode}
          dirty={dirty}
          saving={saving}
          onSave={() => void doSave()}
          onSaveAs={() => setSaveAsName(`${meta.name} (copy)`)}
          onExport={doExport}
          onAutoLayout={doAutoLayout}
          onUndo={undo}
          onRedo={redo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onBack={goBack}
        />
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "clip", position: "relative" }}>
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
            onReconnect={onReconnect}
            onNodeDragStart={recordHistory}
            onBeforeDelete={() => {
              recordHistory();
              return Promise.resolve(true);
            }}
            onDropItem={onDropItem}
            onSelectElement={(kind, id) => {
              // Like dashboards: with the editor open, clicking another element edits that one.
              if (panelRef.current?.mode === "config") {
                openPanel({ mode: "config", kind, id });
              }
            }}
          />
          {configNode && (
            <NodeConfigPanel
              key={`node-${configNode.id}-${panelVersion}`}
              nodeId={configNode.id}
              data={configNode.data}
              timeframe={timeframe}
              onChange={changeNode}
              onDelete={(id) => deleteElement("node", id)}
              onClose={() => openPanel(null)}
            />
          )}
          {configEdge && edgeDraft && (
            <EdgeConfigPanel
              key={`edge-${configEdge.id}-${panelVersion}`}
              edgeId={configEdge.id}
              value={edgeDraft}
              ends={{ sourceHandle: configEdge.sourceHandle ?? undefined, targetHandle: configEdge.targetHandle ?? undefined }}
              sourceName={nodes.find((n) => n.id === configEdge.source)?.data.name ?? configEdge.source}
              targetName={nodes.find((n) => n.id === configEdge.target)?.data.name ?? configEdge.target}
              timeframe={timeframe}
              onChange={changeEdge}
              onEndsChange={changeEdgeEnds}
              onDelete={(id) => deleteElement("edge", id)}
              onClose={() => openPanel(null)}
            />
          )}
          {panel?.mode === "detail" && (
            <NodeDetailDrawer
              target={detailTarget}
              nodeStatus={panel.kind === "node" ? status.nodes[panel.id] : undefined}
              edgeStatus={panel.kind === "edge" ? status.edges[panel.id] : undefined}
              tf={status.resolvedTimeframe}
              onClose={() => openPanel(null)}
            />
          )}
        </div>
      </div>

      <Modal
        title="This diagram was modified by someone else"
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
              Reload
            </Button>
            <Button color="critical" variant="emphasized" onClick={() => void doSave(true)} loading={saving}>
              Overwrite
            </Button>
          </Flex>
        }
      >
        {conflict && (
          <span>
            Last modified {conflict.current.updatedAt} by {conflict.current.owner || "unknown"}. "Reload" discards your
            changes; "Overwrite" replaces the saved version.
          </span>
        )}
      </Modal>

      <Modal
        title="Save as"
        show={saveAsName !== null}
        onDismiss={() => setSaveAsName(null)}
        footer={
          <Flex gap={8} justifyContent="flex-end">
            <Button onClick={() => setSaveAsName(null)}>Cancel</Button>
            <Button
              variant="accent"
              color="primary"
              loading={saving}
              disabled={!saveAsName?.trim()}
              onClick={() => saveAsName && void doSaveAs(saveAsName.trim())}
            >
              Save
            </Button>
          </Flex>
        }
      >
        <TextInput value={saveAsName ?? ""} onChange={(v) => setSaveAsName(v)} aria-label="New diagram name" />
      </Modal>

      <Modal
        title="You have unsaved changes"
        show={leaveOpen}
        onDismiss={() => setLeaveOpen(false)}
        footer={
          <Flex gap={8} justifyContent="flex-end">
            <Button onClick={() => setLeaveOpen(false)}>Keep editing</Button>
            <Button color="critical" onClick={() => navigate("/")}>
              Leave without saving
            </Button>
          </Flex>
        }
      >
        If you leave now, your changes will be lost.
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
