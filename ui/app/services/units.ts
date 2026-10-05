/** Units offered by the unit picker; anything else is a custom unit. */
export const UNIT_PRESETS: Array<{ value: string; label: string }> = [
  { value: "", label: "No unit" },
  { value: "ms", label: "ms · milliseconds" },
  { value: "s", label: "s · seconds" },
  { value: "min", label: "min · minutes" },
  { value: "h", label: "h · hours" },
  { value: "%", label: "% · percent" },
  { value: "req/s", label: "req/s · requests per second" },
  { value: "req/min", label: "req/min · requests per minute" },
  { value: "count", label: "count" },
  { value: "errors", label: "errors" },
  { value: "users", label: "users" },
  { value: "B", label: "B · bytes" },
  { value: "KB", label: "KB · kilobytes" },
  { value: "MB", label: "MB · megabytes" },
  { value: "GB", label: "GB · gigabytes" },
  { value: "MB/s", label: "MB/s · throughput" },
  { value: "$", label: "$ · dollars" },
];

export function isPresetUnit(unit: string | undefined): boolean {
  return UNIT_PRESETS.some((p) => p.value === (unit ?? ""));
}

/** "1,234.5 ms" — the value with its unit (no space before %). */
export function withUnit(text: string, unit: string | undefined): string {
  if (!unit) {
    return text;
  }
  return unit === "%" ? `${text}%` : `${text} ${unit}`;
}
