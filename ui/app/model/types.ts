export type Status = "pass" | "warning" | "failing" | "unknown" | "loading";

export interface Timeframe {
  /** Expression as stored by the selector, e.g. "now()-2h" or an ISO 8601 string. */
  from: string;
  to: string;
}

export interface ResolvedTimeframe {
  /** Absolute ISO 8601, resolved at the start of each refresh cycle. */
  from: string;
  to: string;
}

export type DqlRecord = Record<string, unknown>;

export interface DqlResult {
  records: DqlRecord[];
  /** Columns in the order they appear in the first record and in the Grail types. */
  columns: string[];
  /** Grail type per column (long, double, string, timestamp...). */
  types: Record<string, string>;
}

export interface ProblemRow {
  eventId: string;
  eventKind: string;
  displayId: string;
  name: string;
  status: string;
  category: string;
  start: string;
  end?: string;
  affectedIds: string[];
  rootCauseName?: string;
}

export interface SubStatus {
  key: string;
  name: string;
  status: Status;
  /** Active problems (entities mode) */
  problems?: number;
  /** SLO mode */
  value?: number;
  errorBudget?: number;
  message?: string;
}

/** Result of one KPI item under a node. */
export interface KpiItemState {
  id: string;
  status: "ok" | "error";
  error?: string;
  lines: Array<{ label: string; value: number | null }>;
}

/** Results of the KPI block of a node, one entry per KPI item. */
export interface KpiState {
  items: KpiItemState[];
}

export interface NodeStatus {
  status: Status;
  error?: string;
  /** Active problems matching the filter */
  activeProblems?: number;
  entityIds?: string[];
  /** Problems DQL (active) with timeframe and ids already inserted */
  problemsDql?: string;
  children?: SubStatus[];
  kpi?: KpiState;
}

export interface EdgeStatus {
  status: Status;
  error?: string;
  value?: number;
  rawValue?: unknown;
}

export interface DiagramStatus {
  nodes: Record<string, NodeStatus>;
  edges: Record<string, EdgeStatus>;
  resolvedTimeframe?: ResolvedTimeframe;
  lastUpdated?: Date;
}
