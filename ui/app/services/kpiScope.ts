import type { EntityRef } from "../model/schema";
import type { DqlRecord } from "../model/types";
import { asText, dqlString } from "./dql";

/** The entities a component stands for; they fill the placeholders of its KPI queries. */
export interface EntityScope {
  /** Smartscape ids (the dimension values of the metrics), e.g. SERVICE-…, HOST-…. */
  ids: string[];
  names: string[];
  /** Endpoint names (endpoint components). */
  endpoints: string[];
}

/**
 * Placeholders a KPI query can use, replaced right before it runs with the component's selection as quoted,
 * comma-separated values — so they go inside `array(…)`, like multi-select dashboard variables:
 * `filter: { in(toString(dt.smartscape.service), array($entityIds)) }`.
 */
export const SCOPE_PLACEHOLDERS = {
  entityIds: "ids",
  entityNames: "names",
  endpointNames: "endpoints",
} as const satisfies Record<string, keyof EntityScope>;

export const PLACEHOLDER_PATTERN = "\\$(entityIds|entityNames|endpointNames)\\b";

/**
 * Each placeholder as a string literal of the same length (`$entityIds` → `"entityId"`): valid DQL whose error
 * positions match the original text. Used to validate queries in the editor.
 */
export function maskPlaceholders(dql: string): string {
  return dql.replace(new RegExp(PLACEHOLDER_PATTERN, "g"), (match: string) => `"${match.slice(1, -1)}"`);
}

export function usesScope(dql: string): boolean {
  return new RegExp(PLACEHOLDER_PATTERN).test(dql);
}

const unique = (values: string[]) => Array.from(new Set(values.filter((v) => v !== "")));

export function scopeFromRefs(refs: EntityRef[]): EntityScope {
  return {
    ids: unique(refs.map((r) => r.id)),
    names: unique(refs.map((r) => r.name)),
    endpoints: unique(refs.map((r) => r.endpoint ?? "")),
  };
}

/** From the rows of an entity query: `id`, `name` and, for endpoints, `endpoint` columns. */
export function scopeFromRecords(records: DqlRecord[]): EntityScope {
  return {
    ids: unique(records.map((r) => asText(r.id))),
    names: unique(records.map((r) => asText(r.name))),
    endpoints: unique(records.map((r) => asText(r.endpoint))),
  };
}

/**
 * Fills the placeholders of a KPI query. Throws a readable error when the query needs a selection the component
 * doesn't have (no scope at all, or no entities / endpoints picked).
 */
export function expandScope(dql: string, scope: EntityScope | undefined): string {
  if (!usesScope(dql)) {
    return dql;
  }
  if (!scope) {
    throw new Error("This KPI uses $entityIds, which only works in an entity component (it means the entities you pick).");
  }
  return dql.replace(new RegExp(PLACEHOLDER_PATTERN, "g"), (_match, name: keyof typeof SCOPE_PLACEHOLDERS) => {
    const values = scope[SCOPE_PLACEHOLDERS[name]];
    if (values.length === 0) {
      throw new Error(name === "endpointNames" ? "Pick at least one endpoint." : "Pick at least one entity.");
    }
    return values.map(dqlString).join(", ");
  });
}
