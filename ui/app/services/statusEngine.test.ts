import { describe, expect, it, vi } from "vitest";

vi.mock("@dynatrace-sdk/client-query", () => ({ queryExecutionClient: {} }));
vi.mock("@dynatrace-sdk/client-service-level-objectives", () => ({
  serviceLevelObjectivesClient: {},
  serviceLevelObjectivesEvaluationClient: {},
}));

import { aggregateContainer, createLimiter, evalThreshold, statusFromProblemCount } from "./statusEngine";

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
