import { describe, expect, it, vi } from "vitest";

vi.mock("@dynatrace-sdk/client-query", () => ({ queryExecutionClient: {} }));

import type { KpiItem } from "../model/schema";
import type { DqlResult } from "../model/types";
import { kpiItems, kpiLines, kpiTitle, labelColumns } from "./kpi";
import { isPresetUnit, withUnit } from "./units";

const result: DqlResult = {
  columns: ["service", "avg_ms", "errors"],
  types: { service: "string", avg_ms: "double", errors: "long" },
  records: [
    { service: "checkout", avg_ms: 120.5, errors: "3" },
    { service: "payments", avg_ms: 88, errors: "0" },
    { service: "search", avg_ms: 42, errors: "1" },
  ],
};

const base: KpiItem = { id: "k1", dql: "…", labelMode: "text", decimals: 2, maxRows: 5 };

describe("kpiLines", () => {
  it("custom text: one line with the first row's value from the chosen column", () => {
    const lines = kpiLines({ ...base, labelText: "Errors", valueField: "errors" }, result);
    expect(lines).toEqual({ ok: true, lines: [{ label: "Errors", value: 3 }] });
  });

  it("custom text without a value column uses the first numeric column", () => {
    const lines = kpiLines({ ...base, labelText: "Latency" }, result);
    expect(lines.ok && lines.lines[0]).toEqual({ label: "Latency", value: 120.5 });
  });

  it("label from a column: one line per row, limited by maxRows", () => {
    const lines = kpiLines({ ...base, labelMode: "column", labelField: "service", valueField: "avg_ms", maxRows: 2 }, result);
    expect(lines).toEqual({
      ok: true,
      lines: [
        { label: "checkout", value: 120.5 },
        { label: "payments", value: 88 },
      ],
    });
  });

  it("label column defaults to the first non-numeric column", () => {
    expect(labelColumns(result)).toEqual(["service"]);
    const lines = kpiLines({ ...base, labelMode: "column" }, result);
    expect(lines.ok && lines.lines.map((l) => l.label)).toEqual(["checkout", "payments", "search"]);
  });

  it("timeseries arrays use their last value", () => {
    const ts: DqlResult = { columns: ["v"], types: { v: "array" }, records: [{ v: [1, 2, null] }] };
    const lines = kpiLines({ ...base, valueField: "v", labelText: "Series" }, ts);
    expect(lines.ok && lines.lines[0].value).toBe(2);
  });

  it("reports a clear error when there is no numeric value", () => {
    const text: DqlResult = { columns: ["name"], types: { name: "string" }, records: [{ name: "x" }] };
    expect(kpiLines(base, text)).toEqual({ ok: false, error: "The query returns no numeric column for the value." });
    expect(kpiLines({ ...base, valueField: "nope" }, result).ok).toBe(false);
  });
});

describe("kpiTitle", () => {
  it("uses the title, then the ready-made KPI it came from, then the fixed name", () => {
    expect(kpiTitle({ ...base, labelMode: "column", title: "Latency" })).toBe("Latency");
    expect(kpiTitle({ ...base, labelMode: "column", preset: "service.requests" })).toBe("Request count");
    expect(kpiTitle({ ...base, labelText: "Errors" })).toBe("Errors");
    expect(kpiTitle({ ...base, labelMode: "column" })).toBeUndefined();
  });
});

describe("kpiItems", () => {
  it("reads a legacy block (one query shown as a table) as one column KPI", () => {
    const items = kpiItems({ enabled: true, title: "Signals", items: [], dql: "fetch logs | summarize c = count()", maxRows: 3 });
    expect(items).toEqual([{ id: "legacy", dql: "fetch logs | summarize c = count()", labelMode: "column", decimals: 2, maxRows: 3 }]);
  });

  it("prefers the item list and ignores empty blocks", () => {
    expect(kpiItems({ enabled: true, title: "K", items: [base] })).toEqual([base]);
    expect(kpiItems({ enabled: true, title: "K", items: [] })).toEqual([]);
    expect(kpiItems(undefined)).toEqual([]);
  });
});

describe("units", () => {
  it("formats values with their unit", () => {
    expect(withUnit("12.5", "ms")).toBe("12.5 ms");
    expect(withUnit("99.9", "%")).toBe("99.9%");
    expect(withUnit("7", undefined)).toBe("7");
  });

  it("recognizes preset and custom units", () => {
    expect(isPresetUnit("ms")).toBe(true);
    expect(isPresetUnit(undefined)).toBe(true);
    expect(isPresetUnit("orders/min")).toBe(false);
  });
});
