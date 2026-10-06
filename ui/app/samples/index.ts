import { Diagram } from "../model/schema";
import { SAMPLE_DIAGRAM_ID, buildSampleDiagram } from "../model/defaults";
import type { SampleEntry } from "../services/lookupStore";
import easytradeJson from "./easytrade.json";
import platformSignalsJson from "./platform-signals.json";

/**
 * Sample diagrams bundled with the app (all named "Sample – …"). They are added to the diagram list on first use,
 * and `npm run export:schema` copies them to skill/examples. Ids are fixed so a sample is only ever added once.
 */
export const BUNDLED_SAMPLES: Diagram[] = [Diagram.parse(platformSignalsJson), Diagram.parse(easytradeJson)];

/** Every sample, in list order. "Sample – Online Banking" is built at runtime to include the tenant's SLOs. */
export function sampleCatalog(listSlos: () => Promise<Array<{ id: string; name: string }>>): SampleEntry[] {
  return [
    {
      id: SAMPLE_DIAGRAM_ID,
      build: async () => buildSampleDiagram("system", (await listSlos().catch(() => [])).slice(0, 3)),
    },
    ...BUNDLED_SAMPLES.map((d) => ({ id: d.id, build: () => Promise.resolve(structuredClone(d)) })),
  ];
}
