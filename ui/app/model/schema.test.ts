import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@dynatrace-sdk/client-query", () => ({ queryExecutionClient: {} }));

import { Diagram, parseDiagram } from "./schema";
import { buildSampleDiagram, newKpiEdge } from "./defaults";
import { fromFlowEdges, fromFlowNodes, toFlowEdges, toFlowNodes } from "../canvas/flowTypes";
import { ICONS } from "../services/icons";

describe("diagram schema", () => {
  const sample = buildSampleDiagram("system", [{ id: "slo-1", name: "Checkout availability" }]);

  it("the sample diagram conforms to the schema", () => {
    expect(parseDiagram(sample).ok).toBe(true);
  });

  it("all sample icons exist in @dynatrace/strato-icons", () => {
    for (const node of sample.nodes) {
      expect(ICONS[node.data.icon], node.data.icon).toBeDefined();
    }
  });

  it("applies defaults when importing a minimal JSON", () => {
    const parsed = Diagram.parse({
      schemaVersion: "1.0",
      id: "x",
      name: "Mínimo",
      createdAt: "2026-10-04T00:00:00Z",
      updatedAt: "2026-10-04T00:00:00Z",
      settings: {},
      nodes: [],
      edges: [{ id: "e", source: "a", target: "b", type: "normal" }],
    });
    expect(parsed.settings).toMatchObject({ background: "dots", refreshInterval: "off", defaultTimeframe: { from: "now()-2h", to: "now()" } });
    expect(parsed.edges[0].direction).toBe("forward");
  });

  it("rejects unknown component types with a readable message", () => {
    const bad = structuredClone(sample) as unknown as { nodes: Array<{ data: { componentType?: string } }> };
    bad.nodes[0].data.componentType = "mainframe";
    const res = parseDiagram(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("nodes.0.data");
    }
  });

  it("skill/examples samples conform to the schema and use existing icons", () => {
    const dir = "skill/examples";
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const parsed = parseDiagram(JSON.parse(readFileSync(`${dir}/${file}`, "utf-8")));
      expect(parsed.ok ? "" : parsed.error, file).toBe("");
      if (parsed.ok) {
        for (const node of parsed.diagram.nodes) {
          expect(ICONS[node.data.icon], `${file}: ${node.data.icon}`).toBeDefined();
        }
      }
    }
  });

  it("entity nodes keep a manual size and stay auto-sized otherwise", () => {
    const [entity] = sample.nodes;
    const resized = { ...entity, size: { w: 320, h: 140 } };
    const flow = toFlowNodes([entity, resized]);
    expect(flow[0]).toMatchObject({ width: 240, height: undefined });
    expect(flow[1]).toMatchObject({ width: 320, height: 140 });
    expect(fromFlowNodes(flow)).toEqual([entity, resized]);
  });

  it("lossless export → import (JSON and React Flow round-trip conversion)", () => {
    const withExtras = {
      ...sample,
      settings: { ...sample.settings, viewport: { x: 10, y: -20, zoom: 0.8 } },
      edges: [...sample.edges, { ...newKpiEdge("n1", "n3", "e9"), direction: "backward" as const, label: "Latencia" }],
    };
    const reimported = parseDiagram(JSON.parse(JSON.stringify(withExtras)));
    expect(reimported.ok && reimported.diagram).toEqual(withExtras);

    const nodes = fromFlowNodes(toFlowNodes(withExtras.nodes));
    const edges = fromFlowEdges(toFlowEdges(withExtras.edges));
    expect(nodes).toEqual(withExtras.nodes);
    expect(edges).toEqual(withExtras.edges);
  });
});
