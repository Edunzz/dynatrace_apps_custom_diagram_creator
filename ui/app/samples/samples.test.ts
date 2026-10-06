import { describe, expect, it, vi } from "vitest";

vi.mock("@dynatrace-sdk/client-query", () => ({ queryExecutionClient: {} }));

import { SAMPLE_DIAGRAM_ID } from "../model/defaults";
import { ICONS } from "../services/icons";
import { META_ID } from "../services/lookupStore";
import { BUNDLED_SAMPLES, sampleCatalog } from "./index";

describe("bundled samples", () => {
  const catalog = sampleCatalog(() => Promise.resolve([{ id: "slo-1", name: "Checkout availability" }]));

  it("lists every sample once, Online Banking first, with fixed ids", () => {
    const ids = catalog.map((s) => s.id);
    expect(ids[0]).toBe(SAMPLE_DIAGRAM_ID);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(META_ID);
    expect(ids.every((id) => /^00000000-0000-4000-8000-0000000000\d\d$/.test(id))).toBe(true);
  });

  it("every sample is named 'Sample – …', owned by system and uses existing icons", async () => {
    for (const entry of catalog) {
      const d = await entry.build();
      expect(d.id).toBe(entry.id);
      expect(d.name).toMatch(/^Sample – /);
      expect(d.owner).toBe("system");
      for (const node of d.nodes) {
        expect(ICONS[node.data.icon], `${d.name}: ${node.data.icon}`).toBeDefined();
      }
    }
  });

  it("bundled samples are portable: entities are selected by query, not by fixed ids", () => {
    for (const d of BUNDLED_SAMPLES) {
      for (const node of d.nodes) {
        if (node.data.kind === "entity") {
          expect(node.data.entities, `${d.name}: ${node.data.name}`).toEqual([]);
          expect(node.data.entityDql, `${d.name}: ${node.data.name}`).toBeTruthy();
        }
      }
    }
  });
});
