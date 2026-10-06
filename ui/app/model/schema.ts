import { z } from "zod";
import { COMPONENT_TYPE_IDS } from "./componentTypes";

/** KPI edge threshold. above: value > X is bad; below: value < X is bad. */
export const Threshold = z.object({
  direction: z.enum(["above", "below"]),
  warning: z.number().nullable(),
  failing: z.number().nullable(),
});

/**
 * One KPI shown under a node: a value read from a DQL result, a label and a unit.
 * - labelMode "text": a fixed label and the value of the first row (one line).
 * - labelMode "column": one line per result row (up to maxRows), labelled with a result column.
 */
export const KpiItem = z.object({
  id: z.string(),
  dql: z.string(),
  /** Column holding the value; default: the first numeric column. */
  valueField: z.string().optional(),
  labelMode: z.enum(["text", "column"]).default("text"),
  /** Fixed label for labelMode "text". */
  labelText: z.string().optional(),
  /** Column holding the label for labelMode "column"; default: the first non-numeric column. */
  labelField: z.string().optional(),
  /** Free text; the editor offers common units and a custom one. */
  unit: z.string().optional(),
  decimals: z.number().int().min(0).max(10).default(2),
  /** Maximum lines when the label comes from a column. */
  maxRows: z.number().int().min(1).max(50).default(5),
  /** Name of the KPI, e.g. "Response time": shown above its lines when they are named from a column. */
  title: z.string().optional(),
  /** Key of the ready-made KPI it was added from (see kpiPresets.ts); dropped once its query is edited. */
  preset: z.string().optional(),
});

/** Optional list of KPIs shown below any node. */
export const KpiBlock = z.object({
  enabled: z.boolean().default(false),
  title: z.string().default("KPIs"),
  items: z.array(KpiItem).default([]),
  /** Legacy (≤ 0.2): a single query rendered as a table. Read as one "column" KPI; dropped when edited. */
  dql: z.string().optional(),
  /** Legacy (≤ 0.2): rows of the legacy table. */
  maxRows: z.number().int().min(1).optional(),
});

export const EntityFailPoint = z.object({
  /** DQL fragment appended as `| filter <problemMatch>` to the problems DQL. */
  problemMatch: z.string().optional(),
  /** Number of active problems to turn orange. */
  warningMin: z.number().int().min(1).default(1),
  /** Number of active problems to turn red (if warningMin = failingMin, red wins). */
  failingMin: z.number().int().min(1).default(1),
});

/** Kinds of entity component; see componentTypes.ts for labels, Smartscape types and icons. */
export const ComponentType = z.enum(COMPONENT_TYPE_IDS);

/** An entity picked in the editor. classicId is the classic entity id (e.g. APPLICATION-…) when Smartscape has one. */
export const EntityRef = z.object({
  id: z.string(),
  name: z.string(),
  classicId: z.string().optional(),
  /** Endpoint components: the endpoint name (id is then the id of its service). */
  endpoint: z.string().optional(),
});

export const EntityNodeData = z.object({
  kind: z.literal("entity"),
  componentType: ComponentType,
  name: z.string(),
  /** Entities picked in the editor (the normal way to define a component). */
  entities: z.array(EntityRef).default([]),
  /**
   * Optional query that selects the entities dynamically (must return `id`, preferably `name`).
   * Used only when no entities are picked, e.g. by the sample diagram, imported files or the agent skill.
   */
  entityDql: z.string().optional(),
  /** Export name from @dynatrace/strato-icons, e.g. "ServicesIcon". */
  icon: z.string(),
  failPoint: EntityFailPoint,
  kpi: KpiBlock.optional(),
});

export const CustomEntities = z.object({
  /** Must return at least the `id` and `name` columns. */
  dql: z.string(),
  subNameField: z.string().default("name"),
  criterion: z.enum(["anyProblem", "match"]).default("anyProblem"),
  problemMatch: z.string().optional(),
});

export const SloRef = z.object({ id: z.string(), name: z.string() });

export const CustomNodeData = z.object({
  kind: z.literal("custom"),
  icon: z.string(),
  name: z.string(),
  mode: z.enum(["entities", "slos"]),
  entities: CustomEntities.optional(),
  slos: z.array(SloRef).optional(),
  /** Rows visible before internal scrolling. */
  maxVisibleRows: z.number().int().min(1).default(8),
  kpi: KpiBlock.optional(),
});

export const NodeData = z.discriminatedUnion("kind", [EntityNodeData, CustomNodeData]);

export const Node = z.object({
  id: z.string(),
  type: z.enum(["entityNode", "customNode"]),
  position: z.object({ x: z.number(), y: z.number() }),
  size: z.object({ w: z.number(), h: z.number() }).optional(),
  data: NodeData,
});

export const EdgeKpi = z.object({
  /** Must return a single value: first row, `valueField` column or the first numeric one. */
  dql: z.string(),
  valueField: z.string().optional(),
  unit: z.string().optional(),
  decimals: z.number().int().min(0).max(10).default(2),
  threshold: Threshold,
  animated: z.boolean().default(true),
});

export const Edge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  type: z.enum(["normal", "kpi"]),
  /** forward: ->, backward: <-, none: plain line. */
  direction: z.enum(["forward", "backward", "none"]).default("forward"),
  label: z.string().optional(),
  kpi: EdgeKpi.optional(),
});

export const RefreshInterval = z.enum(["off", "30s", "1m", "5m", "15m", "30m"]);
export const Background = z.enum(["dots", "grid", "blank"]);

export const Settings = z.object({
  background: Background.default("dots"),
  defaultTimeframe: z
    .object({ from: z.string(), to: z.string() })
    .default({ from: "now()-2h", to: "now()" }),
  refreshInterval: RefreshInterval.default("off"),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).optional(),
});

export const Diagram = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  owner: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: Settings,
  nodes: z.array(Node),
  edges: z.array(Edge),
});

export type Threshold = z.infer<typeof Threshold>;
export type KpiItem = z.infer<typeof KpiItem>;
export type KpiBlock = z.infer<typeof KpiBlock>;
export type EntityRef = z.infer<typeof EntityRef>;
export type EntityFailPoint = z.infer<typeof EntityFailPoint>;
export type ComponentType = z.infer<typeof ComponentType>;
export type EntityNodeData = z.infer<typeof EntityNodeData>;
export type CustomNodeData = z.infer<typeof CustomNodeData>;
export type NodeData = z.infer<typeof NodeData>;
export type DiagramNode = z.infer<typeof Node>;
export type EdgeKpi = z.infer<typeof EdgeKpi>;
export type DiagramEdge = z.infer<typeof Edge>;
export type RefreshInterval = z.infer<typeof RefreshInterval>;
export type Background = z.infer<typeof Background>;
export type Settings = z.infer<typeof Settings>;
export type Diagram = z.infer<typeof Diagram>;

/** Validates arbitrary JSON and returns the diagram or a readable message. */
export function parseDiagram(input: unknown): { ok: true; diagram: Diagram } | { ok: false; error: string } {
  const result = Diagram.safeParse(input);
  if (result.success) {
    return { ok: true, diagram: result.data };
  }
  const error = result.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  return { ok: false, error };
}
