import type { ResolvedTimeframe, Timeframe } from "../model/types";

type Unit = "s" | "m" | "h" | "d" | "w" | "M" | "q" | "y";

const OFFSET_RE = /([+-])\s*(\d+)\s*([smhdwMqy])/g;
const EXPR_RE = /^now(?:\(\))?((?:\s*[+-]\s*\d+\s*[smhdwMqy])*)\s*(?:@(\d*)([smhdwMqy])(\d)?)?$/;

function applyOffset(date: Date, sign: number, amount: number, unit: Unit): Date {
  const d = new Date(date.getTime());
  const n = sign * amount;
  switch (unit) {
    case "s":
      d.setSeconds(d.getSeconds() + n);
      break;
    case "m":
      d.setMinutes(d.getMinutes() + n);
      break;
    case "h":
      d.setHours(d.getHours() + n);
      break;
    case "d":
      d.setDate(d.getDate() + n);
      break;
    case "w":
      d.setDate(d.getDate() + 7 * n);
      break;
    case "M":
      d.setMonth(d.getMonth() + n);
      break;
    case "q":
      d.setMonth(d.getMonth() + 3 * n);
      break;
    case "y":
      d.setFullYear(d.getFullYear() + n);
      break;
  }
  return d;
}

/** Rounds down, in local time, like the DQL `@` operator. `@w` aligns to Monday (or to day `@wN`, 1 = Monday). */
function align(date: Date, factor: number, unit: Unit, weekday?: number): Date {
  const d = new Date(date.getTime());
  switch (unit) {
    case "s":
      d.setMilliseconds(0);
      d.setSeconds(Math.floor(d.getSeconds() / factor) * factor);
      break;
    case "m":
      d.setSeconds(0, 0);
      d.setMinutes(Math.floor(d.getMinutes() / factor) * factor);
      break;
    case "h":
      d.setMinutes(0, 0, 0);
      d.setHours(Math.floor(d.getHours() / factor) * factor);
      break;
    case "d":
      d.setHours(0, 0, 0, 0);
      break;
    case "w": {
      d.setHours(0, 0, 0, 0);
      const target = weekday ?? 1; // 1 = Monday ... 7 = Sunday
      const current = d.getDay() === 0 ? 7 : d.getDay();
      const diff = (current - target + 7) % 7;
      d.setDate(d.getDate() - diff);
      break;
    }
    case "M":
      d.setHours(0, 0, 0, 0);
      d.setDate(1);
      d.setMonth(Math.floor(d.getMonth() / factor) * factor);
      break;
    case "q":
      d.setHours(0, 0, 0, 0);
      d.setDate(1);
      d.setMonth(Math.floor(d.getMonth() / 3) * 3);
      break;
    case "y":
      d.setHours(0, 0, 0, 0);
      d.setMonth(0, 1);
      break;
  }
  return d;
}

/**
 * Resolves a time expression to an absolute date.
 * Supports ISO 8601 and relative expressions such as `now()`, `now()-2h`, `now()-1d@d`, `now()@w`.
 * Returns null if not recognized.
 */
export function resolveTimeExpression(expr: string, now: Date = new Date()): Date | null {
  let trimmed = expr.trim();
  // Strato presets such as "@d" (today) or "-1d@d" (yesterday) leave out "now()".
  if (/^[@+-]/.test(trimmed)) {
    trimmed = `now()${trimmed}`;
  }
  const match = EXPR_RE.exec(trimmed);
  if (match) {
    let date = new Date(now.getTime());
    const offsets = match[1] ?? "";
    for (const part of offsets.matchAll(OFFSET_RE)) {
      date = applyOffset(date, part[1] === "-" ? -1 : 1, Number(part[2]), part[3] as Unit);
    }
    if (match[3]) {
      const factor = match[2] ? Math.max(1, Number(match[2])) : 1;
      const weekday = match[4] ? Number(match[4]) : undefined;
      date = align(date, factor, match[3] as Unit, weekday);
    }
    return date;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export const DEFAULT_TIMEFRAME: Timeframe = { from: "now()-2h", to: "now()" };

/** Converts the selector timeframe to absolute ISO values. If either part isn't recognized, uses the last 2 h. */
export function resolveTimeframe(tf: Timeframe, now: Date = new Date()): ResolvedTimeframe {
  const from = resolveTimeExpression(tf.from, now);
  const to = resolveTimeExpression(tf.to, now);
  if (!from || !to || from.getTime() >= to.getTime()) {
    return {
      from: new Date(now.getTime() - 2 * 3600_000).toISOString(),
      to: now.toISOString(),
    };
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export function formatDateTime(value: string | number | Date | undefined | null): string {
  if (value === undefined || value === null || value === "") {
    return "—";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatTime(date: Date | undefined): string {
  if (!date) {
    return "—";
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function userTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export const REFRESH_MS: Record<string, number | null> = {
  off: null,
  "30s": 30_000,
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
};
