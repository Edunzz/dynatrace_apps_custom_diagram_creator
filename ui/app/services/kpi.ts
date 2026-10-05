import type { KpiBlock, KpiItem } from "../model/schema";
import type { DqlResult } from "../model/types";
import { asText, numericColumns, toNumber } from "./dql";

export interface KpiLine {
  label: string;
  value: number | null;
}

/** KPIs of a block. A legacy block (≤ 0.2, one query shown as a table) is read as one "column" KPI. */
export function kpiItems(block: KpiBlock | undefined): KpiItem[] {
  if (!block) {
    return [];
  }
  if (block.items.length > 0) {
    return block.items;
  }
  if (block.dql?.trim()) {
    return [{ id: "legacy", dql: block.dql, labelMode: "column", decimals: 2, maxRows: block.maxRows ?? 5 }];
  }
  return [];
}

function lastNumber(value: unknown): number | null {
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i--) {
      const n = toNumber(value[i]);
      if (n !== null) {
        return n;
      }
    }
    return null;
  }
  return toNumber(value);
}

/** Columns a label can come from: everything that isn't numeric. */
export function labelColumns(result: DqlResult): string[] {
  const numeric = new Set(numericColumns(result));
  return result.columns.filter((c) => !numeric.has(c));
}

/**
 * Lines of one KPI for a query result.
 * - "text": one line with the fixed label and the value of the first row.
 * - "column": one line per row (up to maxRows) labelled with a result column.
 */
export function kpiLines(item: KpiItem, result: DqlResult): { ok: true; lines: KpiLine[] } | { ok: false; error: string } {
  const valueField = item.valueField?.trim() || numericColumns(result)[0];
  if (!valueField) {
    return { ok: false, error: "The query returns no numeric column for the value." };
  }
  if (result.records.length > 0 && !(valueField in result.records[0])) {
    return { ok: false, error: `The value column "${valueField}" isn't in the result.` };
  }
  if (item.labelMode === "text") {
    const first = result.records[0];
    return {
      ok: true,
      lines: [{ label: item.labelText?.trim() || valueField, value: first ? lastNumber(first[valueField]) : null }],
    };
  }
  const labelField = item.labelField?.trim() || labelColumns(result)[0];
  return {
    ok: true,
    lines: result.records.slice(0, item.maxRows).map((record, index) => ({
      label: labelField ? asText(record[labelField]) || "—" : `#${index + 1}`,
      value: lastNumber(record[valueField]),
    })),
  };
}

export function newKpiItem(id: string): KpiItem {
  return {
    id,
    dql: "timeseries rt = avg(dt.service.request.response_time, scalar: true)\n| fieldsAdd avg_ms = rt / 1000\n| fields avg_ms",
    valueField: "avg_ms",
    labelMode: "text",
    labelText: "Response time",
    unit: "ms",
    decimals: 1,
    maxRows: 5,
  };
}
