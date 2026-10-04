import React from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { CheckmarkIcon, CriticalIcon, HelpIcon, WarningIcon } from "@dynatrace/strato-icons";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import type { Status } from "../model/types";

/** Primary color (lines, dots, indicators). Always Strato tokens, never hardcoded hex. */
export const STATUS_COLOR: Record<Status, string> = {
  pass: Colors.Charts.Status.Ideal.Default,
  warning: Colors.Charts.Status.Warning.Default,
  failing: Colors.Charts.Status.Critical.Default,
  unknown: Colors.Border.Neutral.Accent,
  loading: Colors.Border.Neutral.Default,
};

/** Background for blocks and containers. */
export const STATUS_BG: Record<Status, string> = {
  pass: Colors.Background.Container.Success.Default,
  warning: Colors.Background.Container.Warning.Default,
  failing: Colors.Background.Container.Critical.Default,
  unknown: Colors.Background.Container.Neutral.Default,
  loading: Colors.Background.Surface.Default,
};

export const STATUS_LABEL: Record<Status, string> = {
  pass: "OK",
  warning: "Warning",
  failing: "Failing",
  unknown: "No data / error",
  loading: "Loading…",
};

/** Color is never the only cue: each status also has its own icon. */
export function StatusGlyph({ status, size = "small" }: { status: Status; size?: "small" | "default" }) {
  const style = { color: STATUS_COLOR[status], flexShrink: 0 };
  switch (status) {
    case "pass":
      return <CheckmarkIcon size={size} style={style} aria-label={STATUS_LABEL.pass} />;
    case "warning":
      return <WarningIcon size={size} style={style} aria-label={STATUS_LABEL.warning} />;
    case "failing":
      return <CriticalIcon size={size} style={style} aria-label={STATUS_LABEL.failing} />;
    case "loading":
      return <ProgressCircle size="small" aria-label={STATUS_LABEL.loading} />;
    default:
      return <HelpIcon size={size} style={style} aria-label={STATUS_LABEL.unknown} />;
  }
}

export function StatusDot({ status }: { status: Status }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: STATUS_COLOR[status],
        flexShrink: 0,
      }}
    />
  );
}
