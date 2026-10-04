import { queryExecutionClient, type QueryResult } from "@dynatrace-sdk/client-query";
import type { DqlRecord, DqlResult, ResolvedTimeframe } from "../model/types";
import { userTimezone } from "./time";

const POLL_TIMEOUT_MS = 10_000;
const MAX_POLLS = 30;

export interface RunQueryOptions {
  signal?: AbortSignal;
  maxResultRecords?: number;
}

function normalizeResult(result: QueryResult): DqlResult {
  const records = result.records.filter((r): r is NonNullable<typeof r> => r !== null) as DqlRecord[];
  const types: Record<string, string> = {};
  const columns: string[] = [];
  for (const ranged of result.types ?? []) {
    for (const [field, fieldType] of Object.entries(ranged.mappings ?? {})) {
      if (!(field in types) && fieldType) {
        types[field] = fieldType.type;
        columns.push(field);
      }
    }
  }
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!columns.includes(key)) {
        columns.push(key);
      }
    }
  }
  return { records, columns, types };
}

/**
 * Runs a DQL query and waits for the result (queryExecute + queryPoll).
 * The timeframe is passed as the default timeframe: if the DQL defines its own from:/to:, that takes precedence.
 */
export async function runQuery(
  query: string,
  tf?: ResolvedTimeframe,
  options: RunQueryOptions = {},
): Promise<DqlResult> {
  const { signal, maxResultRecords = 1000 } = options;
  const start = await queryExecutionClient.queryExecute({
    body: {
      query,
      defaultTimeframeStart: tf?.from,
      defaultTimeframeEnd: tf?.to,
      timezone: userTimezone(),
      requestTimeoutMilliseconds: 30_000,
      maxResultRecords,
    },
    abortSignal: signal,
  });

  if (start.state === "SUCCEEDED" && start.result) {
    return normalizeResult(start.result);
  }
  if (!start.requestToken) {
    throw new Error(`The query ended in state ${start.state} without a result.`);
  }

  for (let i = 0; i < MAX_POLLS; i++) {
    if (signal?.aborted) {
      throw new DOMException("Query cancelled", "AbortError");
    }
    const poll = await queryExecutionClient.queryPoll({
      requestToken: start.requestToken,
      requestTimeoutMilliseconds: POLL_TIMEOUT_MS,
      abortSignal: signal,
    });
    if (poll.state === "SUCCEEDED" && poll.result) {
      return normalizeResult(poll.result);
    }
    if (poll.state === "FAILED" || poll.state === "CANCELLED" || poll.state === "RESULT_GONE") {
      throw new Error(`The query ended in state ${poll.state}.`);
    }
  }
  throw new Error("The query exceeded the maximum wait time.");
}

interface ErrorBodyShape {
  body?: {
    error?: {
      message?: string;
      details?: { errorMessage?: string; errorType?: string; missingScopes?: string[]; missingPermissions?: string[] };
    };
  };
  message?: string;
}

/** Extracts the Grail message (or the generic one) from an SDK error. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as ErrorBodyShape;
    const details = e.body?.error?.details;
    const base = details?.errorMessage ?? e.body?.error?.message ?? e.message;
    const extra: string[] = [];
    if (details?.missingScopes?.length) {
      extra.push(`missing scopes: ${details.missingScopes.join(", ")}`);
    }
    if (details?.missingPermissions?.length) {
      extra.push(`missing permissions: ${details.missingPermissions.join(", ")}`);
    }
    if (base) {
      return extra.length ? `${base} (${extra.join("; ")})` : base;
    }
  }
  return String(err);
}

export function errorType(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    return (err as ErrorBodyShape).body?.error?.details?.errorType;
  }
  return undefined;
}

export function isAbortError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const name = (err as { name?: string }).name;
    return name === "AbortError" || name === "HttpClientAbortError";
  }
  return false;
}

const NUMERIC_TYPES = new Set(["long", "double"]);

/** Converts a Grail value to a number (longs arrive as strings). */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function numericColumns(result: DqlResult): string[] {
  return result.columns.filter((c) => {
    const t = result.types[c];
    if (t) {
      return NUMERIC_TYPES.has(t);
    }
    const first = result.records[0]?.[c];
    return typeof first === "number";
  });
}

/** Validator for custom nodes / entity nodes: the columns must exist. Returns the error or null. */
export function assertColumns(result: DqlResult, required: string[]): string | null {
  const missing = required.filter((c) => !result.columns.includes(c));
  if (missing.length) {
    return `The query must return the column(s): ${missing.join(", ")}. Returned columns: ${
      result.columns.join(", ") || "(none)"
    }`;
  }
  return null;
}

/** Validator for KPI edges: first row, valueField column or the first numeric one. */
export function assertSingleValue(
  result: DqlResult,
  valueField?: string,
): { ok: true; value: number; raw: unknown; field: string } | { ok: false; error: string } {
  if (result.records.length === 0) {
    return { ok: false, error: "The query returned no rows." };
  }
  const first = result.records[0];
  const field = valueField && valueField.trim() !== "" ? valueField : numericColumns(result)[0];
  if (!field) {
    return { ok: false, error: "The query doesn't return any numeric column." };
  }
  if (!(field in first)) {
    return { ok: false, error: `Column "${field}" doesn't exist in the result.` };
  }
  const raw = first[field];
  const value = Array.isArray(raw) ? lastNumber(raw) : toNumber(raw);
  if (value === null) {
    return { ok: false, error: `The value of "${field}" isn't numeric.` };
  }
  return { ok: true, value, raw, field };
}

/** Validator for KPI blocks: must return a table (at least one column). */
export function assertTable(result: DqlResult): string | null {
  if (result.columns.length === 0) {
    return "The query returned no columns.";
  }
  return null;
}

function lastNumber(values: unknown[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const n = toNumber(values[i]);
    if (n !== null) {
      return n;
    }
  }
  return null;
}

/** Compact formatting for KPI table cells. */
export function formatCell(value: unknown, type?: string): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (Array.isArray(value)) {
    const n = lastNumber(value);
    if (n !== null) {
      return `${formatNumber(n)} (last)`;
    }
    return value.map((v) => formatCell(v)).join(", ");
  }
  if (type && NUMERIC_TYPES.has(type)) {
    const n = toNumber(value);
    return n === null ? asText(value) : formatNumber(n);
  }
  if (typeof value === "number") {
    return formatNumber(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("start" in obj && "end" in obj) {
      return `${asText(obj.start)} → ${asText(obj.end)}`;
    }
    return JSON.stringify(value);
  }
  return asText(value);
}

export function formatNumber(n: number, decimals?: number): string {
  if (decimals !== undefined) {
    return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  const abs = Math.abs(n);
  const maximumFractionDigits = abs >= 100 ? 0 : abs >= 1 ? 2 : 4;
  return n.toLocaleString(undefined, { maximumFractionDigits });
}

/** Readable text for any Grail value (objects are serialized as JSON). */
export function asText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Escapes a string literal for insertion into DQL within double quotes. */
export function dqlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
