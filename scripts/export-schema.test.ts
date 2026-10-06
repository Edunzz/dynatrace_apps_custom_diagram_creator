import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { it, vi } from "vitest";
import { z } from "zod";

vi.mock("@dynatrace-sdk/client-query", () => ({ queryExecutionClient: {} }));

import { Diagram } from "../ui/app/model/schema";

it("exports the JSON schema and the sample diagram for the skill", () => {
  const jsonSchema = {
    $id: "https://my.custom.diagram.creator/diagram.schema.json",
    title: "Custom Diagram Creator – Diagram",
    description: "Generated from ui/app/model/schema.ts (zod). Do not edit by hand: npm run export:schema",
    ...z.toJSONSchema(Diagram, { io: "input" }),
  };
  mkdirSync("skill/examples", { recursive: true });
  writeFileSync("skill/diagram.schema.json", JSON.stringify(jsonSchema, null, 2) + "\n", "utf-8");
  // The sample bundled with the app is the skill's example too.
  copyFileSync("ui/app/samples/easytrade.json", "skill/examples/easytrade-showcase.json");
});
