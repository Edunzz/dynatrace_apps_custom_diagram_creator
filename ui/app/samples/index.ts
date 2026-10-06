import { Diagram } from "../model/schema";
import type { SampleEntry } from "../services/lookupStore";
import easytradeJson from "./easytrade.json";

/**
 * Sample diagrams bundled with the app (named "Sample – …"). They are added to the diagram list on first use, and
 * `npm run export:schema` copies them to skill/examples. Ids are fixed so a sample is only ever added once.
 */
export const BUNDLED_SAMPLES: Diagram[] = [Diagram.parse(easytradeJson)];

/**
 * Samples of earlier versions ("Sample – Online Banking", "Sample – Platform signals"): removed from a table while
 * nobody has saved them since they were added.
 */
export const RETIRED_SAMPLE_IDS = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];

export function sampleCatalog(): SampleEntry[] {
  return BUNDLED_SAMPLES.map((d) => ({ id: d.id, build: () => Promise.resolve(structuredClone(d)) }));
}
