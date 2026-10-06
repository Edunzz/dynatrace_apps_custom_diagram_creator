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

import { lookupDataClient } from "@dynatrace-sdk/client-resource-store";
import { buildSampleDiagram, newDiagram } from "../model/defaults";
import {
  ConflictError,
  META_ID,
  sameInstant,
  decodePayload,
  deleteDiagrams,
  encodePayload,
  ensureSamples,
  getDiagram,
  listDiagrams,
  parseRow,
  rowsFingerprint,
  rowsToJsonl,
  saveDiagram,
  saveDiagrams,
  toRow,
  type SampleEntry,
} from "./lookupStore";

const sample = (id: string, name: string): SampleEntry => ({ id, build: () => Promise.resolve(newDiagram(id, name, "system")) });

describe("payload encoding", () => {
  it("round-trips UTF-8 JSON through base64 (with accents, quotes and line breaks)", () => {
    const d = { ...newDiagram("id-1", 'Diagrama «Pagos», "core"\nv2 – ñandú', "yo@x.com"), description: "línea 1\nlínea 2, con coma" };
    const payload = encodePayload(d);
    expect(payload).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(decodePayload(payload)).toEqual(d);
  });

  it("rejects payloads that don't match the schema", () => {
    expect(() => decodePayload(btoa(JSON.stringify({ hello: "world" })))).toThrow(/not valid/);
  });

  it("toRow / rowsToJsonl / parseRow preserve the fields", () => {
    const row = toRow(newDiagram("id-2", "X", "o"));
    const jsonl = rowsToJsonl([row, { ...row, id: "id-3" }]);
    expect(jsonl.trim().split("\n")).toHaveLength(2);
    expect(parseRow(JSON.parse(jsonl.split("\n")[0]) as DqlRecord)).toEqual(row);
  });
});

describe("rowsFingerprint", () => {
  it("ignores row order and the precision Grail returns", () => {
    const a = [
      { id: "b", updatedAt: "2026-10-04T10:00:00.123Z", deleted: false },
      { id: "a", updatedAt: "2026-10-04T09:00:00.000Z", deleted: true },
    ];
    const b = [
      { id: "a", updatedAt: "2026-10-04T09:00:00.000000000Z", deleted: true },
      { id: "b", updatedAt: "2026-10-04T10:00:00.123456789Z", deleted: false },
    ];
    expect(rowsFingerprint(a)).toBe(rowsFingerprint(b));
    expect(rowsFingerprint(a)).not.toBe(rowsFingerprint([a[0]]));
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

  it("bootstrap: creates the table with every sample, then leaves it alone", async () => {
    const catalog = [
      { id: "00000000-0000-4000-8000-000000000001", build: () => Promise.resolve(buildSampleDiagram("system", [])) },
      sample("s-2", "Sample – Two"),
    ];
    expect(await ensureSamples(catalog)).toEqual({ created: true, added: ["Sample – Online Banking", "Sample – Two"] });
    const uploads = vi.mocked(lookupDataClient.upload).mock.calls.length;
    expect(await ensureSamples(catalog)).toEqual({ created: false, added: [] });
    expect(vi.mocked(lookupDataClient.upload).mock.calls.length).toBe(uploads);
    expect((await listDiagrams()).map((d) => d.name).sort()).toEqual(["Sample – Online Banking", "Sample – Two"]);
    // The metadata row is stored but never listed.
    expect(table.rows?.some((r) => r.id === META_ID && r.deleted === true)).toBe(true);
  });

  it("a deleted sample doesn't come back, but a sample added in a later version does (once)", async () => {
    await ensureSamples([sample("s-1", "Sample – One")]);
    await deleteDiagrams(["s-1"]);
    await saveDiagram(newDiagram("mine", "Mine", "a@x.com"));
    expect(await ensureSamples([sample("s-1", "Sample – One")])).toEqual({ created: false, added: [] });
    expect(await ensureSamples([sample("s-1", "Sample – One"), sample("s-2", "Sample – Two")])).toEqual({
      created: false,
      added: ["Sample – Two"],
    });
    await deleteDiagrams(["s-2"]);
    expect(await ensureSamples([sample("s-1", "Sample – One"), sample("s-2", "Sample – Two")])).toEqual({ created: false, added: [] });
    expect((await listDiagrams()).map((d) => d.id)).toEqual(["mine"]);
  });

  it("tables from before the metadata row keep their samples and receive the missing ones", async () => {
    await saveDiagram(newDiagram("s-1", "Sample – One", "system"));
    await saveDiagram(newDiagram("mine", "Mine", "a@x.com"));
    expect(await ensureSamples([sample("s-1", "Sample – One"), sample("s-2", "Sample – Two")])).toEqual({
      created: false,
      added: ["Sample – Two"],
    });
    expect((await listDiagrams()).map((d) => d.id).sort()).toEqual(["mine", "s-1", "s-2"]);
  });

  it("uploads several diagrams with a single write", async () => {
    await saveDiagram(newDiagram("keep", "Keep", "a@x.com"));
    const before = vi.mocked(lookupDataClient.upload).mock.calls.length;
    const saved = await saveDiagrams([newDiagram("u-1", "One", "a@x.com"), newDiagram("u-2", "Two", "a@x.com")]);
    expect(vi.mocked(lookupDataClient.upload).mock.calls.length).toBe(before + 1);
    expect(saved.map((d) => d.id)).toEqual(["u-1", "u-2"]);
    expect((await listDiagrams()).map((d) => d.id).sort()).toEqual(["keep", "u-1", "u-2"]);
  });

  it("create, read, update with concurrency control, and delete", async () => {
    const created = await saveDiagram(newDiagram("d-1", "One", "a@x.com"));
    await saveDiagram(newDiagram("d-2", "Two", "b@x.com"));
    expect((await listDiagrams()).map((d) => d.id).sort()).toEqual(["d-1", "d-2"]);

    const { diagram, updatedAt } = await getDiagram("d-1");
    expect(diagram.name).toBe("One");
    expect(updatedAt).toBe(created.updatedAt);

    // Another user saves in between -> conflict.
    await new Promise((r) => setTimeout(r, 5));
    await saveDiagram({ ...diagram, name: "One (someone else)" }, { expectedUpdatedAt: updatedAt });
    await expect(saveDiagram({ ...diagram, name: "One (me)" }, { expectedUpdatedAt: updatedAt })).rejects.toBeInstanceOf(ConflictError);
    // "Overwrite"
    await saveDiagram({ ...diagram, name: "One (me)" }, { expectedUpdatedAt: updatedAt, force: true });
    expect((await getDiagram("d-1")).diagram.name).toBe("One (me)");

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
    await saveDiagram(newDiagram("new", "New", "a@x.com"));
    expect(table.rows?.map((r) => r.id)).toEqual(["new"]);
  });
});
