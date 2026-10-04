import { defineConfig } from "vitest/config";

// `npm run export:schema`: regenerates skill/diagram.schema.json and skill/examples/sample-diagram.json from the zod schema.
export default defineConfig({
  test: {
    include: ["scripts/export-schema.test.ts"],
    environment: "node",
  },
});
