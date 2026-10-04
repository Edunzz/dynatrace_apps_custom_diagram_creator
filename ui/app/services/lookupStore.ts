import { lookupDataClient } from "@dynatrace-sdk/client-resource-store";
import { getCurrentUserDetails } from "@dynatrace-sdk/app-environment";
import { parseDiagram, type Diagram } from "../model/schema";
import type { DqlRecord } from "../model/types";
import { asText, dqlString, errorMessage, errorType, runQuery } from "./dql";

export const LOOKUP_PATH = "/lookups/custom-diagram-creator/diagrams";
export const LOOKUP_DISPLAY_NAME = "Custom Diagram Creator diagrams";
/**
 * Each JSONL line is an object; autoFlatten expands it into columns.
 * Types are explicit: with `JSON:json` Grail converts ISO dates into timestamps (with nanoseconds)
 * and any date-like text (e.g. a name "2026-10-04") would change when read back.
 */
export const PARSE_PATTERN =
  "JSON{STRING:id, STRING:name, STRING:description, STRING:owner, STRING:createdAt, STRING:updatedAt, BOOLEAN:deleted, STRING:payload}:row";
/** Documented per-file limit for Grail lookups. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
/** Per-diagram size above which the user is warned. */
export const WARN_DIAGRAM_BYTES = 5 * 1024 * 1024;

export interface DiagramRow {
  id: string;
  name: string;
  description: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  /** Diagram JSON in base64 (UTF-8). */
  payload: string;
}

export type DiagramSummary = Omit<DiagramRow, "payload" | "deleted">;

export class ConflictError extends Error {
  constructor(public readonly current: DiagramSummary) {
    super("This diagram was modified by someone else");
    this.name = "ConflictError";
  }
}

export class SizeLimitError extends Error {
  constructor(bytes: number) {
    super(
      `Diagram storage would take ${(bytes / 1024 / 1024).toFixed(1)} MB, which exceeds the limit of ${
        MAX_FILE_BYTES / 1024 / 1024
      } MB per lookup table.`,
    );
    this.name = "SizeLimitError";
  }
}

// ---------- encoding ----------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodePayload(diagram: Diagram): string {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(diagram)));
}

export function decodePayload(payload: string): Diagram {
  const json: unknown = JSON.parse(new TextDecoder().decode(base64ToBytes(payload)));
  const parsed = parseDiagram(json);
  if (!parsed.ok) {
    throw new Error(`The stored diagram is not valid: ${parsed.error}`);
  }
  return parsed.diagram;
}

export function toRow(diagram: Diagram): DiagramRow {
  return {
    id: diagram.id,
    name: diagram.name,
    description: diagram.description ?? "",
    owner: diagram.owner ?? "",
    createdAt: diagram.createdAt,
    updatedAt: diagram.updatedAt,
    deleted: false,
    payload: encodePayload(diagram),
  };
}

function str(v: unknown): string {
  return asText(v);
}

export function parseRow(record: DqlRecord): DiagramRow {
  return {
    id: str(record.id),
    name: str(record.name),
    description: str(record.description),
    owner: str(record.owner),
    createdAt: str(record.createdAt),
    updatedAt: str(record.updatedAt),
    deleted: record.deleted === true || record.deleted === "true",
    payload: str(record.payload),
  };
}

export function toSummary(row: DiagramRow): DiagramSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    owner: row.owner,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Compares two ISO instants ignoring format (Grail may return nanoseconds). */
export function sameInstant(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  const norm = (s: string) => Date.parse(s.replace(/(\.\d{3})\d+/, "$1"));
  const ta = norm(a);
  const tb = norm(b);
  return !Number.isNaN(ta) && ta === tb;
}

export function rowsToJsonl(rows: DiagramRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function currentUser(): string {
  try {
    const user = getCurrentUserDetails();
    return user.email || user.name || "unknown";
  } catch {
    return "unknown";
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

// ---------- reading ----------

export function isMissingFileError(err: unknown): boolean {
  const type = errorType(err) ?? "";
  const msg = errorMessage(err);
  return type.includes("UNKNOWN_TABULAR_FILE") || /tabular file .* doesn't exist/i.test(msg);
}

/** All rows (including payload). Returns null if the lookup does not exist yet. */
export async function loadAllRows(signal?: AbortSignal): Promise<DiagramRow[] | null> {
  try {
    const result = await runQuery(`load ${dqlString(LOOKUP_PATH)}`, undefined, { signal, maxResultRecords: 10_000 });
    return result.records.map(parseRow);
  } catch (e) {
    if (isMissingFileError(e)) {
      return null;
    }
    throw e;
  }
}

export async function listDiagrams(signal?: AbortSignal): Promise<DiagramSummary[]> {
  const query = [
    `load ${dqlString(LOOKUP_PATH)}`,
    `| filter isFalseOrNull(deleted)`,
    `| fields id, name, description, owner, createdAt, updatedAt`,
    `| sort updatedAt desc`,
  ].join("\n");
  const result = await runQuery(query, undefined, { signal, maxResultRecords: 10_000 });
  return result.records.map((r) => toSummary(parseRow(r)));
}

export async function getDiagram(id: string, signal?: AbortSignal): Promise<{ diagram: Diagram; updatedAt: string }> {
  const query = `load ${dqlString(LOOKUP_PATH)}\n| filter id == ${dqlString(id)}\n| fields payload, updatedAt, deleted`;
  const result = await runQuery(query, undefined, { signal, maxResultRecords: 1 });
  const record = result.records[0];
  if (!record || record.deleted === true) {
    throw new Error(`Diagram ${id} doesn't exist.`);
  }
  const row = parseRow(record);
  return { diagram: decodePayload(row.payload), updatedAt: row.updatedAt };
}

// ---------- writing ----------

/** Uploads the whole table, replacing the previous one (lookup tables don't support partial updates). */
export async function writeAllRows(rows: DiagramRow[]): Promise<void> {
  const jsonl = rowsToJsonl(rows);
  const bytes = byteLength(jsonl);
  if (bytes > MAX_FILE_BYTES) {
    throw new SizeLimitError(bytes);
  }
  // The SDK HTTP client accepts a Blob for binary multipart fields (sends it as is).
  const content = new Blob([jsonl], { type: "text/plain" }) as unknown as Parameters<
    typeof lookupDataClient.upload
  >[0]["body"]["content"];
  await lookupDataClient.upload({
    body: {
      content,
      request: {
        filePath: LOOKUP_PATH,
        lookupField: "id",
        parsePattern: PARSE_PATTERN,
        overwrite: true,
        autoFlatten: true,
        displayName: LOOKUP_DISPLAY_NAME,
        description: "Diagrams of the Custom Diagram Creator app (payload = base64-encoded JSON)",
      },
    },
  });
}

export interface SaveOptions {
  /** updatedAt the diagram was opened with. If it differs in the lookup, ConflictError is thrown. */
  expectedUpdatedAt?: string;
  /** Skips the concurrency check ("Overwrite" option). */
  force?: boolean;
}

/** Upserts a diagram. Returns the diagram with the final updatedAt. */
export async function saveDiagram(diagram: Diagram, options: SaveOptions = {}): Promise<Diagram> {
  const rows = (await loadAllRows()) ?? [];
  const index = rows.findIndex((r) => r.id === diagram.id);
  if (!options.force && options.expectedUpdatedAt && index >= 0 && !rows[index].deleted) {
    const current = rows[index];
    if (!sameInstant(current.updatedAt, options.expectedUpdatedAt)) {
      throw new ConflictError(toSummary(current));
    }
  }
  const saved: Diagram = { ...diagram, updatedAt: new Date().toISOString() };
  // deleted=true rows only exist to avoid an empty file: once saving, they are no longer needed.
  const live = rows.filter((r) => !r.deleted && r.id !== saved.id);
  await writeAllRows([...live, toRow(saved)]);
  return saved;
}

/** Deletes diagrams. If the table would end up empty, rows are marked deleted=true to avoid uploading an empty file. */
export async function deleteDiagrams(ids: string[]): Promise<void> {
  const rows = (await loadAllRows()) ?? [];
  const remaining = rows.filter((r) => !ids.includes(r.id) && !r.deleted);
  if (remaining.length > 0) {
    await writeAllRows(remaining);
    return;
  }
  const tombstones = rows.filter((r) => ids.includes(r.id)).map((r) => ({ ...r, deleted: true, payload: "" }));
  if (tombstones.length > 0) {
    await writeAllRows(tombstones.slice(0, 1));
  }
}

/** Deletes the whole file from the Resource Store (admin only). */
export async function deleteLookupFile(filePath: string): Promise<void> {
  await lookupDataClient.delete({ body: { filePath } });
}

/**
 * Bootstrap: if the lookup doesn't exist, creates it with the sample diagram.
 * Returns "created" if it created it, "exists" if it already existed.
 */
export async function ensureStore(buildSample: () => Promise<Diagram>): Promise<"created" | "exists"> {
  try {
    await runQuery(`load ${dqlString(LOOKUP_PATH)}\n| limit 1`, undefined, { maxResultRecords: 1 });
    return "exists";
  } catch (e) {
    if (!isMissingFileError(e)) {
      throw e;
    }
  }
  const sample = await buildSample();
  await writeAllRows([toRow(sample)]);
  return "created";
}
