import React, { useEffect, useRef, useState } from "react";
import { DQLEditor } from "@dynatrace/strato-components/editors";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { PlayIcon } from "@dynatrace/strato-icons";
import type { DqlResult, Timeframe } from "../model/types";
import { errorMessage, runQuery } from "../services/dql";
import { highlightPlaceholders, teachValidationAboutPlaceholders } from "../services/dqlEditorPlaceholders";
import { resolveTimeframe } from "../services/time";
import { ResultTable } from "../canvas/nodes/ResultTable";
import { Field, InlineMessage } from "./Field";

export interface DqlFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  timeframe: Timeframe;
  /** Returns a message if the result isn't as expected (columns, single value…). */
  validate?: (result: DqlResult) => string | null;
  /** Non-blocking warnings (e.g. missing name column). */
  warn?: (result: DqlResult) => string | null;
  onResult?: (result: DqlResult | null) => void;
  /** Called after every Run: the editor applies the query to the diagram and refreshes the element's status. */
  onRun?: () => void;
  /** Turns the text into the query to run (e.g. fills $entityIds with the component's entities). */
  prepare?: (dql: string) => Promise<string>;
  hint?: string;
}

// KPI placeholders ($entityIds…) are valid in every DQL editor of the app.
teachValidationAboutPlaceholders();

/** DQLEditor + Run button + result preview and inline validation. */
export function DqlField({ label, value, onChange, timeframe, validate, warn, onResult, onRun, hint, prepare }: DqlFieldProps) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DqlResult | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // The editor mounts asynchronously: paint the placeholders once it is there.
  useEffect(() => {
    highlightPlaceholders(editorRef.current);
    const timer = window.setTimeout(() => highlightPlaceholders(editorRef.current), 300);
    return () => window.clearTimeout(timer);
  }, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const query = prepare ? await prepare(value) : value;
      const r = await runQuery(query, resolveTimeframe(timeframe), { maxResultRecords: 100 });
      setResult(r);
      onResult?.(r);
    } catch (e) {
      setResult(null);
      onResult?.(null);
      setError(errorMessage(e));
    } finally {
      setRunning(false);
      onRun?.();
    }
  };

  const validation = result && validate ? validate(result) : null;
  const warning = result && warn ? warn(result) : null;

  return (
    <Field label={label} hint={hint}>
      <Flex flexDirection="column" gap={6}>
        {/* Long queries scroll inside the editor instead of stretching the panel. */}
        <div ref={editorRef} style={{ minHeight: 90, maxHeight: 280, overflow: "auto" }}>
          <DQLEditor value={value} onChange={onChange} lineWrap />
        </div>
        <Flex alignItems="center" gap={8}>
          <Button size="condensed" variant="emphasized" onClick={() => void run()} loading={running} disabled={!value.trim()}>
            <Button.Prefix>
              <PlayIcon />
            </Button.Prefix>
            Run
          </Button>
          {result && !error && (
            <InlineMessage kind={validation ? "error" : "success"}>
              {validation ?? `${result.records.length} row(s) · columns: ${result.columns.join(", ") || "—"}`}
            </InlineMessage>
          )}
        </Flex>
        {error && <InlineMessage kind="error">{error}</InlineMessage>}
        {warning && !validation && <InlineMessage kind="warning">{warning}</InlineMessage>}
        {result && result.columns.length > 0 && (
          <div className="cdc-preview-table-wrap">
            <ResultTable result={result} maxRows={20} />
          </div>
        )}
      </Flex>
    </Field>
  );
}
