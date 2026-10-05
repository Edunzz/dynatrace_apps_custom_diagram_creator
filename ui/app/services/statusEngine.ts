import type { CustomNodeData, DiagramEdge, DiagramNode, EntityFailPoint, EntityNodeData, KpiBlock, KpiItem, Threshold } from "../model/schema";
import type {
  DiagramStatus,
  DqlResult,
  EdgeStatus,
  KpiItemState,
  KpiState,
  NodeStatus,
  ProblemRow,
  ResolvedTimeframe,
  Status,
  SubStatus,
} from "../model/types";
import { asText, assertColumns, assertSingleValue, errorMessage, isAbortError, runQuery } from "./dql";
import { buildProblemsDql, countProblemsFor, entityKeys, toProblemRow } from "./queryBuilder";
import { evaluateSlo } from "./slo";
import { pickedEntityIds } from "./entities";
import { kpiItems, kpiLines } from "./kpi";

export type ThresholdResult = "pass" | "warning" | "failing";

/** Evaluates a value against a threshold. above: bad if higher; below: bad if lower. */
export function evalThreshold(v: number, t: Threshold): ThresholdResult {
  const bad = (lim: number | null) => lim !== null && (t.direction === "above" ? v > lim : v < lim);
  if (bad(t.failing)) {
    return "failing";
  }
  if (bad(t.warning)) {
    return "warning";
  }
  return "pass";
}

/** Status light of an entity node from the number of active problems. If warning = failing, red wins. */
export function statusFromProblemCount(count: number, fp: Pick<EntityFailPoint, "warningMin" | "failingMin">): Status {
  if (count >= fp.failingMin) {
    return "failing";
  }
  if (count >= fp.warningMin) {
    return "warning";
  }
  return "pass";
}

/**
 * Container aggregation:
 * - red if all children are red,
 * - orange if at least one is red or orange (but not all red),
 * - green if all are green,
 * - gray otherwise (no children, or a mix of green and unknown).
 */
export function aggregateContainer(children: Status[]): Status {
  if (children.length === 0) {
    return "unknown";
  }
  if (children.some((s) => s === "loading")) {
    return "loading";
  }
  if (children.every((s) => s === "failing")) {
    return "failing";
  }
  if (children.some((s) => s === "failing" || s === "warning")) {
    return "warning";
  }
  if (children.every((s) => s === "pass")) {
    return "pass";
  }
  return "unknown";
}

/** Minimal concurrency limiter (equivalent to p-limit). */
export function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= concurrency) {
      return;
    }
    const run = queue.shift();
    if (run) {
      active++;
      run();
    }
  };
  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}

export interface StatusCycleContext {
  tf: ResolvedTimeframe;
  signal: AbortSignal;
  /** Runs a DQL query with caching by (dql + timeframe) and limited concurrency. */
  query: (dql: string) => Promise<DqlResult>;
}

export function createCycleContext(tf: ResolvedTimeframe, signal: AbortSignal, concurrency = 4): StatusCycleContext {
  const limit = createLimiter(concurrency);
  const cache = new Map<string, Promise<DqlResult>>();
  return {
    tf,
    signal,
    query: (dql: string) => {
      const key = `${tf.from}|${tf.to}|${dql}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = limit(() => runQuery(dql, tf, { signal }));
        cache.set(key, pending);
      }
      return pending;
    },
  };
}

async function runKpiItem(item: KpiItem, ctx: StatusCycleContext): Promise<KpiItemState> {
  if (!item.dql.trim()) {
    return { id: item.id, status: "error", error: "Write the KPI query.", lines: [] };
  }
  try {
    const result = await ctx.query(item.dql);
    const lines = kpiLines(item, result);
    return lines.ok
      ? { id: item.id, status: "ok", lines: lines.lines }
      : { id: item.id, status: "error", error: lines.error, lines: [] };
  } catch (e) {
    if (isAbortError(e)) {
      throw e;
    }
    return { id: item.id, status: "error", error: errorMessage(e), lines: [] };
  }
}

async function runKpiBlock(kpi: KpiBlock | undefined, ctx: StatusCycleContext): Promise<KpiState | undefined> {
  const items = kpiItems(kpi);
  if (!kpi?.enabled || items.length === 0) {
    return undefined;
  }
  return { items: await Promise.all(items.map((item) => runKpiItem(item, ctx))) };
}

async function fetchProblems(
  ids: string[],
  problemMatch: string | undefined,
  ctx: StatusCycleContext,
): Promise<{ dql: string; problems: ProblemRow[] }> {
  const dql = buildProblemsDql({ ids, tf: ctx.tf, problemMatch, activeOnly: true });
  const result = await ctx.query(dql);
  return { dql, problems: result.records.map(toProblemRow) };
}

export async function computeEntityNode(data: EntityNodeData, ctx: StatusCycleContext): Promise<NodeStatus> {
  const kpiPromise = runKpiBlock(data.kpi, ctx);
  // Observed right away so a cancellation isn't left as an unhandled rejection if the main block fails first.
  kpiPromise.catch(() => undefined);
  let base: NodeStatus;
  try {
    if (data.entities.length > 0) {
      // Entities picked in the editor: no entity query needed.
      const ids = pickedEntityIds(data.entities);
      const { dql, problems } = await fetchProblems(ids, data.failPoint.problemMatch, ctx);
      return {
        status: statusFromProblemCount(problems.length, data.failPoint),
        activeProblems: problems.length,
        entityIds: ids,
        problemsDql: dql,
        kpi: await kpiPromise,
      };
    }
    if (!data.entityDql?.trim()) {
      return { status: "unknown", error: "Pick at least one entity.", entityIds: [], kpi: await kpiPromise };
    }
    const entities = await ctx.query(data.entityDql);
    const colErr = assertColumns(entities, ["id"]);
    if (colErr) {
      base = { status: "unknown", error: colErr };
    } else if (entities.records.length === 0) {
      base = { status: "unknown", error: "No data: the entity query returned no rows.", entityIds: [] };
    } else {
      const ids = entities.records.flatMap(entityKeys);
      const { dql, problems } = await fetchProblems(ids, data.failPoint.problemMatch, ctx);
      const count = problems.length;
      base = {
        status: statusFromProblemCount(count, data.failPoint),
        activeProblems: count,
        entityIds: ids,
        problemsDql: dql,
      };
    }
  } catch (e) {
    if (isAbortError(e)) {
      throw e;
    }
    base = { status: "unknown", error: errorMessage(e) };
  }
  return { ...base, kpi: await kpiPromise };
}

export async function computeCustomNode(data: CustomNodeData, ctx: StatusCycleContext): Promise<NodeStatus> {
  const kpiPromise = runKpiBlock(data.kpi, ctx);
  // Observed right away so a cancellation isn't left as an unhandled rejection if the main block fails first.
  kpiPromise.catch(() => undefined);
  let base: NodeStatus;
  try {
    base = data.mode === "slos" ? await computeSloChildren(data, ctx) : await computeEntityChildren(data, ctx);
  } catch (e) {
    if (isAbortError(e)) {
      throw e;
    }
    base = { status: "unknown", error: errorMessage(e) };
  }
  return { ...base, kpi: await kpiPromise };
}

async function computeEntityChildren(data: CustomNodeData, ctx: StatusCycleContext): Promise<NodeStatus> {
  const cfg = data.entities;
  if (!cfg || !cfg.dql.trim()) {
    return { status: "unknown", error: "Configure the entities query.", children: [] };
  }
  const entities = await ctx.query(cfg.dql);
  const colErr = assertColumns(entities, ["id", "name"]);
  if (colErr) {
    return { status: "unknown", error: colErr, children: [] };
  }
  if (entities.records.length === 0) {
    return { status: "unknown", error: "No data: the query returned no entities.", children: [] };
  }
  const nameField = cfg.subNameField || "name";
  const ids = entities.records.flatMap(entityKeys);
  const match = cfg.criterion === "match" ? cfg.problemMatch : undefined;
  const { dql, problems } = await fetchProblems(ids, match, ctx);
  const children: SubStatus[] = entities.records.map((record, index) => {
    const keys = entityKeys(record);
    const count = countProblemsFor(keys, problems);
    const rawName = record[nameField] ?? record["name"] ?? keys[0];
    return {
      key: keys[0] ?? String(index),
      name: asText(rawName),
      status: count > 0 ? "failing" : "pass",
      problems: count,
    };
  });
  return {
    status: aggregateContainer(children.map((c) => c.status)),
    activeProblems: problems.length,
    entityIds: ids,
    problemsDql: dql,
    children,
  };
}

async function computeSloChildren(data: CustomNodeData, ctx: StatusCycleContext): Promise<NodeStatus> {
  const slos = data.slos ?? [];
  if (slos.length === 0) {
    return { status: "unknown", error: "Select at least one SLO.", children: [] };
  }
  const children = await Promise.all(
    slos.map(async (slo): Promise<SubStatus> => {
      try {
        const r = await evaluateSlo(slo.id, ctx.signal);
        return { key: slo.id, name: r.name || slo.name, status: r.status, value: r.value, errorBudget: r.errorBudget, message: r.message };
      } catch (e) {
        if (isAbortError(e)) {
          throw e;
        }
        return { key: slo.id, name: slo.name, status: "unknown", message: errorMessage(e) };
      }
    }),
  );
  return { status: aggregateContainer(children.map((c) => c.status)), children };
}

export async function computeKpiEdge(edge: DiagramEdge, ctx: StatusCycleContext): Promise<EdgeStatus> {
  if (edge.type !== "kpi" || !edge.kpi) {
    return { status: "unknown" };
  }
  if (!edge.kpi.dql.trim()) {
    return { status: "unknown", error: "Configure the KPI query." };
  }
  try {
    const result = await ctx.query(edge.kpi.dql);
    const single = assertSingleValue(result, edge.kpi.valueField);
    if (!single.ok) {
      return { status: "unknown", error: single.error };
    }
    return { status: evalThreshold(single.value, edge.kpi.threshold), value: single.value, rawValue: single.raw };
  } catch (e) {
    if (isAbortError(e)) {
      throw e;
    }
    return { status: "unknown", error: errorMessage(e) };
  }
}

export async function computeNode(node: DiagramNode, ctx: StatusCycleContext): Promise<NodeStatus> {
  return node.data.kind === "entity" ? computeEntityNode(node.data, ctx) : computeCustomNode(node.data, ctx);
}

/**
 * Computes the status of the whole diagram. Calls onUpdate as each element finishes,
 * so the canvas renders progressively without waiting for the last one.
 */
export async function computeDiagramStatus(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  ctx: StatusCycleContext,
  onUpdate: (partial: Partial<Pick<DiagramStatus, "nodes" | "edges">>) => void,
): Promise<void> {
  const nodeTasks = nodes.map(async (node) => {
    const status = await computeNode(node, ctx);
    if (!ctx.signal.aborted) {
      onUpdate({ nodes: { [node.id]: status } });
    }
  });
  const edgeTasks = edges
    .filter((e) => e.type === "kpi")
    .map(async (edge) => {
      const status = await computeKpiEdge(edge, ctx);
      if (!ctx.signal.aborted) {
        onUpdate({ edges: { [edge.id]: status } });
      }
    });
  const results = await Promise.allSettled([...nodeTasks, ...edgeTasks]);
  const aborted = results.find((r) => r.status === "rejected" && isAbortError(r.reason));
  if (aborted && aborted.status === "rejected") {
    throw aborted.reason;
  }
}
