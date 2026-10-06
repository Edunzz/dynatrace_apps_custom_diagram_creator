import { describe, expect, it, vi } from "vitest";

vi.mock("@dynatrace-sdk/client-query", () => ({ queryExecutionClient: {} }));

import { buildProblemsDql, countProblemsFor, entityKeys, toProblemRow } from "./queryBuilder";

const tf = { from: "2026-10-04T06:00:00.000Z", to: "2026-10-04T08:00:00.000Z" };

describe("buildProblemsDql", () => {
  it("counts the problems open at any time during the timeframe, active or closed since", () => {
    const dql = buildProblemsDql({ ids: ["SERVICE-1", "SERVICE-2"], tf });
    expect(dql).toContain('fetch dt.davis.problems, from: "2026-10-04T06:00:00.000Z", to: "2026-10-04T08:00:00.000Z"');
    expect(dql).toContain("| filter not(dt.davis.is_duplicate)");
    expect(dql).toContain("| dedup event.id, sort: {timestamp desc}");
    expect(dql).toContain(
      '| filter event.start <= toTimestamp("2026-10-04T08:00:00.000Z") and coalesce(event.end, now()) >= toTimestamp("2026-10-04T06:00:00.000Z")',
    );
    expect(dql).not.toContain('event.status == "ACTIVE"');
    expect(dql).toContain('iAny(in(affected_entity_ids[], array("SERVICE-1", "SERVICE-2")))');
    expect(dql).toContain('iAny(in(toString(smartscape.affected_entity.ids[]), array("SERVICE-1", "SERVICE-2")))');
  });

  it("adds the match after the entity filter and before fields", () => {
    const dql = buildProblemsDql({ ids: ["X-1"], tf, problemMatch: 'event.category == "ERROR"' });
    const lines = dql.split("\n");
    const matchIdx = lines.indexOf('| filter event.category == "ERROR"');
    expect(matchIdx).toBeGreaterThan(lines.findIndex((l) => l.includes("affected_entity_ids[]")));
    expect(matchIdx).toBeLessThan(lines.findIndex((l) => l.startsWith("| fields")));
  });

  it("ignores an empty match, deduplicates ids and escapes quotes", () => {
    const dql = buildProblemsDql({ ids: ["A", "A", 'B"x', ""], tf, problemMatch: "   " });
    expect(dql).toContain('array("A", "B\\"x")');
    expect(dql.split("\n").filter((l) => l.startsWith("| filter")).length).toBe(3);
  });
});

describe("toProblemRow / countProblemsFor / entityKeys", () => {
  const record = {
    "event.id": "ev-1",
    display_id: "P-123",
    "event.name": "High error rate",
    "event.status": "ACTIVE",
    "event.category": "ERROR",
    "event.start": "2026-10-04T07:00:00Z",
    affected_entity_ids: ["SERVICE-AAA"],
    "smartscape.affected_entity.ids": ["SERVICE-BBB"],
  };

  it("merges classic and Smartscape ids and sets a default event.kind", () => {
    const row = toProblemRow(record);
    expect(row.affectedIds.sort()).toEqual(["SERVICE-AAA", "SERVICE-BBB"]);
    expect(row.eventKind).toBe("DAVIS_PROBLEM");
    expect(row.displayId).toBe("P-123");
  });

  it("counts problems by any of the entity's keys", () => {
    const problems = [toProblemRow(record), toProblemRow({ ...record, "event.id": "ev-2", affected_entity_ids: ["HOST-1"], "smartscape.affected_entity.ids": null })];
    expect(countProblemsFor(["SERVICE-BBB"], problems)).toBe(1);
    expect(countProblemsFor(["HOST-1", "SERVICE-AAA"], problems)).toBe(2);
    expect(countProblemsFor(["NOPE"], problems)).toBe(0);
  });

  it("entityKeys uses id and id_classic if present", () => {
    expect(entityKeys({ id: "FRONTEND-1", id_classic: "APPLICATION-1", name: "x" })).toEqual(["FRONTEND-1", "APPLICATION-1"]);
    expect(entityKeys({ id: "SERVICE-1" })).toEqual(["SERVICE-1"]);
  });
});
