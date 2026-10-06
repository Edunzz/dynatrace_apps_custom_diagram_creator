import { getIntentLink } from "@dynatrace-sdk/navigation";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import type { ProblemRow, ResolvedTimeframe } from "../model/types";

function safeIntentLink(payload: Record<string, unknown>, appId: string, intentId: string, fallback: string): string {
  try {
    return getIntentLink(payload, appId, intentId);
  } catch {
    return fallback;
  }
}

function environmentUrl(): string {
  try {
    return getEnvironmentUrl().replace(/\/$/, "");
  } catch {
    return "";
  }
}

/** The problem in the Problems app. */
export function problemLink(p: Pick<ProblemRow, "eventId" | "eventKind">): string {
  return safeIntentLink(
    { "event.id": p.eventId, "event.kind": p.eventKind },
    "dynatrace.davis.problems",
    "view-problem",
    `${environmentUrl()}/ui/apps/dynatrace.davis.problems/problem/${encodeURIComponent(p.eventId)}`,
  );
}

/** The query (and timeframe) in a new notebook. */
export function notebookLink(query: string, tf?: ResolvedTimeframe): string {
  const payload: Record<string, unknown> = { "dt.query": query };
  if (tf) {
    payload["dt.timeframe"] = { from: tf.from, to: tf.to };
  }
  return safeIntentLink(payload, "dynatrace.notebooks", "view-query", `${environmentUrl()}/ui/apps/dynatrace.notebooks`);
}
