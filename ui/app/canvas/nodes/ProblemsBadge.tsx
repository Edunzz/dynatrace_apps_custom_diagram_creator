import React, { type SyntheticEvent } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Button } from "@dynatrace/strato-components/buttons";
import { Menu } from "@dynatrace/strato-components/navigation";
import type { ProblemRow, Status } from "../../model/types";
import { problemLink } from "../../services/links";

const MAX_LISTED = 10;

// The badge lives inside a canvas node: its clicks must not select, drag or open the node.
const stop = (e: SyntheticEvent) => e.stopPropagation();

export function problemsLabel(count: number): string {
  return `${count} problem${count === 1 ? "" : "s"}`;
}

/**
 * "N problems" next to the status of a node: the problems open at any time during the timeframe. When there are
 * some, a click lists them, each linking to the Problems app, plus the node's details.
 */
export function ProblemsBadge({
  count,
  problems,
  status,
  onShowAll,
}: {
  count: number;
  problems?: ProblemRow[];
  status: Status;
  onShowAll: () => void;
}) {
  if (count === 0) {
    return <span className="cdc-problems-badge cdc-problems-none">{problemsLabel(0)}</span>;
  }
  const listed = (problems ?? []).slice(0, MAX_LISTED);
  return (
    <span className="nodrag nopan" onClick={stop} onDoubleClick={stop} onPointerDown={stop}>
      <Menu>
        <Menu.Trigger>
          <Button
            size="condensed"
            color={status === "failing" ? "critical" : status === "warning" ? "warning" : "neutral"}
            aria-label={`${problemsLabel(count)} in the timeframe`}
          >
            <span className="cdc-problems-badge">{problemsLabel(count)}</span>
          </Button>
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Label>Open during the timeframe</Menu.Label>
          {listed.map((p) => (
            <Menu.Link key={p.eventId} href={problemLink(p)} target="_blank" rel="noreferrer" textValue={p.name}>
              <span style={{ display: "flex", flexDirection: "column", maxWidth: 360 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <strong>{p.displayId || "Problem"}</strong> {p.name}
                </span>
                <span style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>
                  {p.status === "ACTIVE" ? "Still active" : "Closed"}
                  {p.category ? ` · ${p.category}` : ""}
                </span>
              </span>
            </Menu.Link>
          ))}
          {count > listed.length && <Menu.Label>{count - listed.length} more in the details</Menu.Label>}
          <Menu.Item onSelect={onShowAll}>All problems and details</Menu.Item>
        </Menu.Content>
      </Menu>
    </span>
  );
}
