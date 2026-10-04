import type { ComponentType } from "../model/schema";
import type { DqlRecord, ProblemRow, ResolvedTimeframe } from "../model/types";
import { asText, dqlString } from "./dql";

export interface ProblemsQueryOptions {
  ids: string[];
  tf: ResolvedTimeframe;
  problemMatch?: string;
  /** true: active problems only (status light). false: active and closed within the timeframe (detail). */
  activeOnly: boolean;
}

export const PROBLEM_FIELDS = [
  "event.id",
  "event.kind",
  "display_id",
  "event.name",
  "event.status",
  "event.category",
  "event.start",
  "event.end",
  "affected_entity_ids",
  "smartscape.affected_entity.ids",
  "root_cause_entity_id",
  "root_cause_entity_name",
];

/**
 * Problems DQL for a set of entities.
 * - Filters out duplicates and keeps the latest state of each problem within the timeframe.
 * - Matches against classic ids (affected_entity_ids) and Smartscape ids (smartscape.affected_entity.ids),
 *   so it works whether the entity DQL uses `fetch dt.entity.*` or `smartscapeNodes`.
 */
export function buildProblemsDql({ ids, tf, problemMatch, activeOnly }: ProblemsQueryOptions): string {
  const uniqueIds = Array.from(new Set(ids.filter((id) => id && id.trim() !== "")));
  const idArray = `array(${uniqueIds.map(dqlString).join(", ")})`;
  const lines = [
    `fetch dt.davis.problems, from: ${dqlString(tf.from)}, to: ${dqlString(tf.to)}`,
    `| filter not(dt.davis.is_duplicate)`,
    `| dedup event.id, sort: {timestamp desc}`,
  ];
  if (activeOnly) {
    lines.push(`| filter event.status == "ACTIVE"`);
  }
  lines.push(
    `| filter iAny(in(affected_entity_ids[], ${idArray})) or iAny(in(toString(smartscape.affected_entity.ids[]), ${idArray}))`,
  );
  const match = problemMatch?.trim();
  if (match) {
    lines.push(`| filter ${match}`);
  }
  lines.push(`| fields ${PROBLEM_FIELDS.join(", ")}`);
  lines.push(`| sort event.start desc`);
  lines.push(`| limit 1000`);
  return lines.join("\n");
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== null && v !== undefined).map((v) => asText(v));
  }
  if (typeof value === "string" && value !== "") {
    return [value];
  }
  return [];
}

function str(value: unknown): string {
  return asText(value);
}

export function toProblemRow(record: DqlRecord): ProblemRow {
  const affected = new Set([
    ...asStringArray(record["affected_entity_ids"]),
    ...asStringArray(record["smartscape.affected_entity.ids"]),
  ]);
  return {
    eventId: str(record["event.id"]),
    eventKind: str(record["event.kind"]) || "DAVIS_PROBLEM",
    displayId: str(record["display_id"]),
    name: str(record["event.name"]),
    status: str(record["event.status"]),
    category: str(record["event.category"]),
    start: str(record["event.start"]),
    end: record["event.end"] ? str(record["event.end"]) : undefined,
    affectedIds: Array.from(affected),
    rootCauseName: record["root_cause_entity_name"] ? str(record["root_cause_entity_name"]) : undefined,
  };
}

/** Ids that identify an entity row: `id` and, if present, `id_classic` (returned by smartscapeNodes). */
export function entityKeys(record: DqlRecord): string[] {
  return [record["id"], record["id_classic"]]
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => asText(v));
}

export function countProblemsFor(keys: string[], problems: ProblemRow[]): number {
  return problems.filter((p) => p.affectedIds.some((id) => keys.includes(id))).length;
}

/** Preloaded entity DQL templates per type (editable). They use Smartscape (dt.entity.* is deprecated). */
export const ENTITY_DQL_TEMPLATES: Record<ComponentType, string> = {
  service: 'smartscapeNodes "SERVICE"\n| filter contains(name, "<text>", caseSensitive: false)\n| fields id, name',
  process: 'smartscapeNodes "PROCESS"\n| filter contains(name, "<text>", caseSensitive: false)\n| fields id, name',
  host: 'smartscapeNodes "HOST"\n| filter contains(name, "<text>", caseSensitive: false)\n| fields id, name',
  workload:
    'smartscapeNodes "K8S_DEPLOYMENT", "K8S_STATEFULSET", "K8S_DAEMONSET"\n| filter contains(name, "<text>", caseSensitive: false)\n| fields id, name, type',
  frontend: 'smartscapeNodes "FRONTEND"\n| filter frontend.type == "web"\n| fields id, id_classic, name',
  mobile: 'smartscapeNodes "FRONTEND"\n| filter frontend.type != "web"\n| fields id, id_classic, name',
};

export const CUSTOM_DQL_TEMPLATE = 'smartscapeNodes "SERVICE"\n| filter contains(name, "<text>", caseSensitive: false)\n| fields id, name\n| limit 20';
