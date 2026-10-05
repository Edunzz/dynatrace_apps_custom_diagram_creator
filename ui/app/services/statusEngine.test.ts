import { describe, expect, it, vi } from "vitest";

vi.mock("@dynatrace-sdk/client-query", () => ({ queryExecutionClient: {} }));
vi.mock("@dynatrace-sdk/client-service-level-objectives", () => ({
  serviceLevelObjectivesClient: {},
  serviceLevelObjectivesEvaluationClient: {},
}));

import type { EntityNodeData } from "../model/schema";
import type { DqlResult } from "../model/types";
import { aggregateContainer, computeEntityNode, createLimiter, evalThreshold, statusFromProblemCount, type StatusCycleContext } from "./statusEngine";

function fakeContext(answer: (dql: string) => DqlResult): StatusCycleContext & { queries: string[] } {
  const queries: string[] = [];
  return {
    tf: { from: "2026-10-04T06:00:00.000Z", to: "2026-10-04T08:00:00.000Z" },
    signal: new AbortController().signal,
    queries,
    query: (dql: string) => {
      queries.push(dql);
      return Promise.resolve(answer(dql));
    },
  };
}

const problem = (id: string, affected: string[]) => ({
  "event.id": id,
  "event.status": "ACTIVE",
  affected_entity_ids: affected,
});

describe("computeEntityNode", () => {
  const base: EntityNodeData = {
    kind: "entity",
    componentType: "frontend",
    name: "Web",
    entities: [],
    icon: "ApplicationsIcon",
    failPoint: { warningMin: 1, failingMin: 2 },
  };

  it("uses the picked entities (Smartscape and classic ids) without an entity query", async () => {
    const ctx = fakeContext(() => ({ columns: [], types: {}, records: [problem("p1", ["APPLICATION-1"])] }));
    const status = await computeEntityNode(
      { ...base, entities: [{ id: "FRONTEND-1", name: "Web", classicId: "APPLICATION-1" }] },
      ctx,
    );
    expect(ctx.queries).toHaveLength(1);
    expect(ctx.queries[0]).toContain("fetch dt.davis.problems");
    expect(ctx.queries[0]).toContain('"FRONTEND-1", "APPLICATION-1"');
    expect(status).toMatchObject({ status: "warning", activeProblems: 1, entityIds: ["FRONTEND-1", "APPLICATION-1"] });
  });

  it("falls back to the entity query when nothing is picked", async () => {
    const ctx = fakeContext((dql) =>
      dql.startsWith("smartscapeNodes")
        ? { columns: ["id", "name"], types: {}, records: [{ id: "SERVICE-9", name: "api" }] }
        : { columns: [], types: {}, records: [] },
    );
    const status = await computeEntityNode({ ...base, entityDql: 'smartscapeNodes "SERVICE" | fields id, name' }, ctx);
    expect(ctx.queries).toHaveLength(2);
    expect(status).toMatchObject({ status: "pass", activeProblems: 0, entityIds: ["SERVICE-9"] });
  });

  it("asks to pick entities when there is neither a selection nor a query", async () => {
    const ctx = fakeContext(() => ({ columns: [], types: {}, records: [] }));
    const status = await computeEntityNode(base, ctx);
    expect(ctx.queries).toHaveLength(0);
    expect(status).toMatchObject({ status: "unknown", error: "Pick at least one entity." });
  });
});

describe("evalThreshold", () => {
  it("above: bad if the value is higher", () => {
    const t = { direction: "above" as const, warning: 300, failing: 800 };
    expect(evalThreshold(100, t)).toBe("pass");
    expect(evalThreshold(300, t)).toBe("pass"); // the exact limit is not bad
    expect(evalThreshold(301, t)).toBe("warning");
    expect(evalThreshold(800, t)).toBe("warning");
    expect(evalThreshold(801, t)).toBe("failing");
  });

  it("below: bad if the value is lower", () => {
    const t = { direction: "below" as const, warning: 99, failing: 95 };
    expect(evalThreshold(99.5, t)).toBe("pass");
    expect(evalThreshold(98, t)).toBe("warning");
    expect(evalThreshold(94, t)).toBe("failing");
  });

  it("ignores null limits", () => {
    expect(evalThreshold(1e9, { direction: "above", warning: null, failing: null })).toBe("pass");
    expect(evalThreshold(10, { direction: "above", warning: null, failing: 5 })).toBe("failing");
    expect(evalThreshold(10, { direction: "above", warning: 5, failing: null })).toBe("warning");
  });
});

describe("statusFromProblemCount", () => {
  it("0 active problems is green", () => {
    expect(statusFromProblemCount(0, { warningMin: 1, failingMin: 3 })).toBe("pass");
  });
  it("between warning and failing is orange; from failing on is red", () => {
    expect(statusFromProblemCount(1, { warningMin: 1, failingMin: 3 })).toBe("warning");
    expect(statusFromProblemCount(2, { warningMin: 1, failingMin: 3 })).toBe("warning");
    expect(statusFromProblemCount(3, { warningMin: 1, failingMin: 3 })).toBe("failing");
  });
  it("if warning = failing, red wins", () => {
    expect(statusFromProblemCount(1, { warningMin: 1, failingMin: 1 })).toBe("failing");
  });
});

describe("aggregateContainer", () => {
  it("all red => red", () => {
    expect(aggregateContainer(["failing", "failing", "failing"])).toBe("failing");
  });
  it("any red or orange (not all red) => orange", () => {
    expect(aggregateContainer(["failing", "pass", "pass"])).toBe("warning");
    expect(aggregateContainer(["warning", "pass"])).toBe("warning");
    expect(aggregateContainer(["failing", "warning"])).toBe("warning");
    expect(aggregateContainer(["failing", "unknown"])).toBe("warning");
  });
  it("all green => green", () => {
    expect(aggregateContainer(["pass", "pass", "pass"])).toBe("pass");
  });
  it("no children or a mix of green and unknown => gray", () => {
    expect(aggregateContainer([])).toBe("unknown");
    expect(aggregateContainer(["pass", "unknown"])).toBe("unknown");
  });
  it("if any child is loading, so is the container", () => {
    expect(aggregateContainer(["pass", "loading"])).toBe("loading");
  });
});

describe("createLimiter", () => {
  it("never runs more tasks than the given concurrency", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let maxActive = 0;
    const task = () =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return active;
      });
    await Promise.all(Array.from({ length: 8 }, task));
    expect(maxActive).toBe(2);
  });

  it("propagates errors without blocking the queue", async () => {
    const limit = createLimiter(1);
    const failing = limit(() => Promise.reject(new Error("boom")));
    const ok = limit(() => Promise.resolve(42));
    await expect(failing).rejects.toThrow("boom");
    await expect(ok).resolves.toBe(42);
  });
});
