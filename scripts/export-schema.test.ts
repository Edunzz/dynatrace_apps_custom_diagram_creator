import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@dynatrace-sdk/client-query", () => ({ queryExecutionClient: {} }));

import { Diagram } from "../ui/app/model/schema";
import { SAMPLE_DIAGRAM_ID, buildSampleDiagram } from "../ui/app/model/defaults";

it("exports the JSON schema and the sample diagrams for the skill", () => {
  const jsonSchema = {
    $id: "https://my.custom.diagram.creator/diagram.schema.json",
    title: "Custom Diagram Creator – Diagram",
    description: "Generated from ui/app/model/schema.ts (zod). Do not edit by hand: npm run export:schema",
    ...z.toJSONSchema(Diagram, { io: "input" }),
  };
  const sample = {
    ...buildSampleDiagram("system", []),
    id: SAMPLE_DIAGRAM_ID,
    createdAt: "2026-10-04T00:00:00Z",
    updatedAt: "2026-10-04T00:00:00Z",
  };
  expect(Diagram.safeParse(sample).success).toBe(true);
  mkdirSync("skill/examples", { recursive: true });
  writeFileSync("skill/diagram.schema.json", JSON.stringify(jsonSchema, null, 2) + "\n", "utf-8");
  writeFileSync("skill/examples/sample-diagram.json", JSON.stringify(sample, null, 2) + "\n", "utf-8");
  // The samples bundled with the app are the skill's examples too.
  copyFileSync("ui/app/samples/platform-signals.json", "skill/examples/platform-signals.json");
  copyFileSync("ui/app/samples/easytrade.json", "skill/examples/easytrade-showcase.json");
});
