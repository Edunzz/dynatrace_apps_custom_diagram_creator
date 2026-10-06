import type { DqlRecord, ProblemRow, ResolvedTimeframe } from "../model/types";
import { asText, dqlString } from "./dql";

export interface ProblemsQueryOptions {
  ids: string[];
  tf: ResolvedTimeframe;
  problemMatch?: string;
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
  "smartscape.affected_entities",
  "root_cause_entity_id",
  "root_cause_entity_name",
];

/**
 * Problems DQL for a set of entities: the problems that were open at any time during the timeframe, so moving the
 * timeframe back shows the picture of that moment (the last 5 minutes: what is open now; a past day: what was open
 * that day, even if it closed later). Grail matches dt.davis.problems by their active interval; the explicit
 * start/end filter states it. `event.status` is the problem's state today.
 * - Filters out duplicates and keeps one row per problem.
 * - Matches the ids in every field environments use for affected entities: classic ids (affected_entity_ids),
 *   Smartscape ids (smartscape.affected_entity.ids) and Smartscape entity records (smartscape.affected_entities, a
 *   list of { id, name, type } — in some environments the only one filled). Smartscape ids match through toString.
 */
export function buildProblemsDql({ ids, tf, problemMatch }: ProblemsQueryOptions): string {
  const uniqueIds = Array.from(new Set(ids.filter((id) => id && id.trim() !== "")));
  const idArray = `array(${uniqueIds.map(dqlString).join(", ")})`;
  const lines = [
    `fetch dt.davis.problems, from: ${dqlString(tf.from)}, to: ${dqlString(tf.to)}`,
    `| filter not(dt.davis.is_duplicate)`,
    `| dedup event.id, sort: {timestamp desc}`,
  ];
  lines.push(
    `| filter event.start <= toTimestamp(${dqlString(tf.to)}) and coalesce(event.end, now()) >= toTimestamp(${dqlString(tf.from)})`,
  );
  lines.push(
    [
      `| filter iAny(in(affected_entity_ids[], ${idArray}))`,
      `    or iAny(in(toString(smartscape.affected_entity.ids[]), ${idArray}))`,
      `    or iAny(in(toString(smartscape.affected_entities[][id]), ${idArray}))`,
    ].join("\n"),
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

/** Ids of a list of entity records such as smartscape.affected_entities ([{ id, name, type }]). */
function entityRecordIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((v: unknown) => (v && typeof v === "object" ? asText((v as Record<string, unknown>).id) : ""))
    .filter((id) => id !== "");
}

function str(value: unknown): string {
  return asText(value);
}

export function toProblemRow(record: DqlRecord): ProblemRow {
  const affected = new Set([
    ...asStringArray(record["affected_entity_ids"]),
    ...asStringArray(record["smartscape.affected_entity.ids"]),
    ...entityRecordIds(record["smartscape.affected_entities"]),
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

export const CUSTOM_DQL_TEMPLATE = 'smartscapeNodes "SERVICE"\n| filter contains(name, "<text>", caseSensitive: false)\n| fields id, name\n| limit 20';
