import { describe, expect, it, vi } from "vitest";

vi.mock("@dynatrace-sdk/client-query", () => ({ queryExecutionClient: {} }));

import { ICONS } from "../services/icons";
import { META_ID } from "../services/lookupStore";
import { BUNDLED_SAMPLES, RETIRED_SAMPLE_IDS, sampleCatalog } from "./index";

describe("bundled samples", () => {
  const catalog = sampleCatalog();

  it("only EasyTrade is bundled; the earlier samples are retired", () => {
    expect(BUNDLED_SAMPLES.map((d) => d.name)).toEqual(["Sample – EasyTrade trading platform"]);
    const ids = catalog.map((s) => s.id);
    expect(ids).toEqual(["00000000-0000-4000-8000-000000000003"]);
    expect(ids).not.toContain(META_ID);
    expect(ids.some((id) => RETIRED_SAMPLE_IDS.includes(id))).toBe(false);
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
