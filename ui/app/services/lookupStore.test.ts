import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DqlRecord, DqlResult } from "../model/types";

/**
 * End-to-end CRUD against an in-memory mock lookup table:
 * - lookupDataClient.upload parses the JSONL like the JSON:json pattern (one row per line),
 * - runQuery interprets the `load` queries the store uses (filter by id, deleted and limit).
 */
const table: { rows: DqlRecord[] | null } = { rows: null };

vi.mock("@dynatrace-sdk/client-query", () => ({ queryExecutionClient: {} }));
vi.mock("@dynatrace-sdk/app-environment", () => ({
  getCurrentUserDetails: () => ({ id: "u1", name: "Test User", email: "test@example.com" }),
}));
vi.mock("@dynatrace-sdk/client-resource-store", () => ({
  lookupDataClient: {
    upload: vi.fn(async ({ body }: { body: { content: Blob; request: { overwrite?: boolean; parsePattern: string } } }) => {
      expect(body.request.overwrite).toBe(true);
      expect(body.request.parsePattern).toMatch(/^JSON\{STRING:id, .*BOOLEAN:deleted, STRING:payload\}:row$/);
      const text = await body.content.text();
      table.rows = text
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l) as DqlRecord);
      return { records: table.rows.length };
    }),
    delete: vi.fn(() => {
      table.rows = null;
      return Promise.resolve();
    }),
  },
}));
vi.mock("./dql", async (importOriginal) => {
  const original = await importOriginal<typeof import("./dql")>();
  return {
    ...original,
    runQuery: vi.fn((query: string): Promise<DqlResult> => {
      if (table.rows === null) {
        return Promise.reject({
          body: { error: { message: "query failed", details: { errorType: "UNKNOWN_TABULAR_FILE", errorMessage: "The tabular file doesn't exist." } } },
        });
      }
      let rows = [...table.rows];
      const idMatch = /filter id == "([^"]+)"/.exec(query);
      if (idMatch) {
        rows = rows.filter((r) => r.id === idMatch[1]);
      }
      if (query.includes("isFalseOrNull(deleted)")) {
        rows = rows.filter((r) => r.deleted !== true);
      }
      if (query.includes("| limit 1")) {
        rows = rows.slice(0, 1);
      }
      const columns = rows.length ? Object.keys(rows[0]) : [];
      return Promise.resolve({ records: rows, columns, types: {} });
    }),
  };
});

import { buildSampleDiagram, newDiagram } from "../model/defaults";
import {
  ConflictError,
  sameInstant,
  decodePayload,
  deleteDiagrams,
  encodePayload,
  ensureStore,
  getDiagram,
  listDiagrams,
  parseRow,
  rowsToJsonl,
  saveDiagram,
  toRow,
} from "./lookupStore";

describe("payload encoding", () => {
  it("round-trips UTF-8 JSON through base64 (with accents, quotes and line breaks)", () => {
    const d = { ...newDiagram("id-1", 'Diagrama «Pagos», "core"\nv2 – ñandú', "yo@x.com"), description: "línea 1\nlínea 2, con coma" };
    const payload = encodePayload(d);
    expect(payload).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(decodePayload(payload)).toEqual(d);
  });

  it("rejects payloads that don't match the schema", () => {
    expect(() => decodePayload(btoa(JSON.stringify({ hello: "world" })))).toThrow(/no es válido/);
  });

  it("toRow / rowsToJsonl / parseRow preserve the fields", () => {
    const row = toRow(newDiagram("id-2", "X", "o"));
    const jsonl = rowsToJsonl([row, { ...row, id: "id-3" }]);
    expect(jsonl.trim().split("\n")).toHaveLength(2);
    expect(parseRow(JSON.parse(jsonl.split("\n")[0]) as DqlRecord)).toEqual(row);
  });
});

describe("sameInstant", () => {
  it("treats the JS ISO string and the Grail one with nanoseconds as equal", () => {
    expect(sameInstant("2026-10-04T08:41:00.123Z", "2026-10-04T08:41:00.123000000Z")).toBe(true);
    expect(sameInstant("2026-10-04T08:41:00Z", "2026-10-04T08:41:00.000000000Z")).toBe(true);
    expect(sameInstant("2026-10-04T08:41:00.123Z", "2026-10-04T08:41:00.124Z")).toBe(false);
  });
});

describe("CRUD on the lookup", () => {
  beforeEach(() => {
    table.rows = null;
  });

  it("bootstrap: creates the table with the sample diagram only if it doesn't exist", async () => {
    expect(await ensureStore(() => Promise.resolve(buildSampleDiagram("system", [])))).toBe("created");
    expect(await ensureStore(() => Promise.resolve(buildSampleDiagram("system", [])))).toBe("exists");
    const list = await listDiagrams();
    expect(list.map((d) => d.name)).toEqual(["Sample – Online Banking"]);
  });

  it("create, read, update with concurrency control, and delete", async () => {
    const created = await saveDiagram(newDiagram("d-1", "Uno", "a@x.com"));
    await saveDiagram(newDiagram("d-2", "Dos", "b@x.com"));
    expect((await listDiagrams()).map((d) => d.id).sort()).toEqual(["d-1", "d-2"]);

    const { diagram, updatedAt } = await getDiagram("d-1");
    expect(diagram.name).toBe("Uno");
    expect(updatedAt).toBe(created.updatedAt);

    // Another user saves in between -> conflict.
    await new Promise((r) => setTimeout(r, 5));
    await saveDiagram({ ...diagram, name: "Uno (otro usuario)" }, { expectedUpdatedAt: updatedAt });
    await expect(saveDiagram({ ...diagram, name: "Uno (yo)" }, { expectedUpdatedAt: updatedAt })).rejects.toBeInstanceOf(ConflictError);
    // «Sobrescribir» (overwrite)
    await saveDiagram({ ...diagram, name: "Uno (yo)" }, { expectedUpdatedAt: updatedAt, force: true });
    expect((await getDiagram("d-1")).diagram.name).toBe("Uno (yo)");

    // Deleting one row doesn't touch the others.
    await deleteDiagrams(["d-1"]);
    expect((await listDiagrams()).map((d) => d.id)).toEqual(["d-2"]);
  });

  it("deleting the last diagram leaves a row marked as deleted (no empty file is uploaded)", async () => {
    await saveDiagram(newDiagram("solo", "Solo", "a@x.com"));
    await deleteDiagrams(["solo"]);
    expect(table.rows).toHaveLength(1);
    expect(table.rows?.[0].deleted).toBe(true);
    expect(await listDiagrams()).toEqual([]);
    await expect(getDiagram("solo")).rejects.toThrow();
    // Saving another diagram removes the marked row.
    await saveDiagram(newDiagram("nuevo", "Nuevo", "a@x.com"));
    expect(table.rows?.map((r) => r.id)).toEqual(["nuevo"]);
  });
});
