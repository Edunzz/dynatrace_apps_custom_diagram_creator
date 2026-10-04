import React from "react";
import type { DqlResult } from "../../model/types";
import { formatCell } from "../../services/dql";

const NUMERIC = new Set(["long", "double"]);

/** Compact table for DQL results (KPI blocks and form previews). */
export function ResultTable({ result, maxRows }: { result: DqlResult; maxRows?: number }) {
  const rows = maxRows ? result.records.slice(0, maxRows) : result.records;
  if (result.columns.length === 0) {
    return null;
  }
  return (
    <table className="cdc-kpi-table">
      <thead>
        <tr>
          {result.columns.map((c) => (
            <th key={c} title={c}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={result.columns.length}>Sin filas</td>
          </tr>
        ) : (
          rows.map((record, i) => (
            <tr key={i}>
              {result.columns.map((c) => {
                const text = formatCell(record[c], result.types[c]);
                return (
                  <td key={c} title={text} className={NUMERIC.has(result.types[c] ?? "") ? "cdc-num" : undefined}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
