import React, { useEffect, useState } from "react";
import { NumberInputV2 } from "@dynatrace/strato-components/forms";

export interface IntegerInputProps {
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
  "aria-label"?: string;
}

/**
 * Whole-number input that can be cleared and retyped: valid numbers apply as you type, and on blur an empty or
 * out-of-range entry snaps back into range instead of being replaced while you are still typing.
 */
export function IntegerInput({ value, min, max = Number.MAX_SAFE_INTEGER, onChange, ...rest }: IntegerInputProps) {
  const [draft, setDraft] = useState<number | null>(value);

  useEffect(() => setDraft(value), [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));

  return (
    <NumberInputV2
      {...rest}
      value={draft}
      min={min}
      max={max === Number.MAX_SAFE_INTEGER ? undefined : max}
      step={1}
      onChange={(v) => {
        setDraft(v);
        if (v !== null && Number.isFinite(v) && clamp(v) === v && v !== value) {
          onChange(v);
        }
      }}
      onBlur={() => {
        const next = draft === null || !Number.isFinite(draft) ? value : clamp(draft);
        setDraft(next);
        if (next !== value) {
          onChange(next);
        }
      }}
    />
  );
}
