import { describe, expect, it, vi } from "vitest";

vi.mock("@dynatrace-sdk/client-query", () => ({ queryExecutionClient: {} }));

import { KpiItem } from "../model/schema";
import { COMPONENT_TYPE_IDS } from "../model/componentTypes";
import { KPI_PRESETS, defaultKpiItems, findPreset, kpiPresetsFor } from "../model/kpiPresets";
import { newEntityNodeData } from "../model/defaults";
import { expandScope, maskPlaceholders, scopeFromRecords, scopeFromRefs, usesScope } from "./kpiScope";

describe("KPI scope placeholders", () => {
  const scope = scopeFromRefs([
    { id: "SERVICE-1", name: "checkout" },
    { id: "SERVICE-2", name: 'pay"ments' },
  ]);

  it("fills $entityIds with quoted ids for array(…)", () => {
    const dql = "timeseries v = sum(m), filter: { in(toString(dt.smartscape.service), array($entityIds)) }";
    expect(usesScope(dql)).toBe(true);
    expect(expandScope(dql, scope)).toBe(
      'timeseries v = sum(m), filter: { in(toString(dt.smartscape.service), array("SERVICE-1", "SERVICE-2")) }',
    );
    expect(expandScope("array($entityNames)", scope)).toBe('array("checkout", "pay\\"ments")');
  });

  it("leaves queries without placeholders alone, even without a scope", () => {
    expect(expandScope("fetch logs | summarize c = count()", undefined)).toBe("fetch logs | summarize c = count()");
    expect(usesScope("fetch logs | filter content == \"$entityIdsX\"")).toBe(false);
  });

  it("masks placeholders as same-length string literals for the editor's validation", () => {
    const dql = "filter: { in(toString(x), array($entityIds)) and in(endpoint.name, array($endpointNames)) }";
    const masked = maskPlaceholders(dql);
    expect(masked).toBe('filter: { in(toString(x), array("entityId")) and in(endpoint.name, array("endpointName")) }');
    expect(masked).toHaveLength(dql.length);
  });

  it("explains what is missing", () => {
    expect(() => expandScope("array($entityIds)", undefined)).toThrow(/entity component/);
    expect(() => expandScope("array($entityIds)", scopeFromRefs([]))).toThrow("Pick at least one entity.");
    expect(() => expandScope("array($endpointNames)", scope)).toThrow("Pick at least one endpoint.");
  });

  it("endpoints share their service id; rows of an entity query work too", () => {
    const endpoints = scopeFromRefs([
      { id: "SERVICE-1", name: "/a · checkout", endpoint: "/a" },
      { id: "SERVICE-1", name: "/b · checkout", endpoint: "/b" },
    ]);
    expect(endpoints).toMatchObject({ ids: ["SERVICE-1"], endpoints: ["/a", "/b"] });
    expect(scopeFromRecords([{ id: "HOST-1", name: "web-1" }, { id: "HOST-2", name: "web-2" }])).toEqual({
      ids: ["HOST-1", "HOST-2"],
      names: ["web-1", "web-2"],
      endpoints: [],
    });
  });
});

describe("ready-made KPIs", () => {
  const all = Object.entries(KPI_PRESETS).flatMap(([type, presets]) => (presets ?? []).map((p) => ({ type, p })));

  it("belong to existing component types, have unique keys and valid items", () => {
    expect(all.length).toBeGreaterThan(40);
    expect(new Set(all.map(({ p }) => p.key)).size).toBe(all.length);
    for (const { type, p } of all) {
      expect(COMPONENT_TYPE_IDS, p.key).toContain(type);
      expect(KpiItem.safeParse({ ...p.item, id: "x" }).success, p.key).toBe(true);
      expect(p.item.preset).toBe(p.key);
      expect(p.item.title).toBe(p.label);
      expect(findPreset(p.key)).toBe(p);
    }
  });

  it("are scoped to the picked entities and show one line per entity", () => {
    for (const { p } of all) {
      expect(p.item.dql, p.key).toContain("array($entityIds)");
      expect(p.item).toMatchObject({ labelMode: "column", labelField: "name", valueField: "value" });
    }
    for (const { p } of all.filter(({ type }) => type === "endpoint")) {
      expect(p.item.dql, p.key).toContain("array($endpointNames)");
    }
  });

  it("services offer request count, response time and failure rate by default; hosts availability", () => {
    expect(defaultKpiItems("service").map((i) => i.preset)).toEqual(["service.requests", "service.response-time", "service.failure-rate"]);
    expect(kpiPresetsFor("host").map((p) => p.key)).toContain("host.availability");
    expect(kpiPresetsFor("browserMonitor").map((p) => p.key)).toContain("browser.availability");
    expect(kpiPresetsFor("awsLambda")).toEqual([]);
  });

  it("new components start with their type's default KPIs", () => {
    expect(newEntityNodeData("service").kpi?.items).toHaveLength(3);
    expect(newEntityNodeData("service").kpi?.enabled).toBe(true);
    expect(newEntityNodeData("awsS3").kpi).toBeUndefined();
  });
});
