import React, { useEffect, useState } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Flex } from "@dynatrace/strato-components/layouts";
import { CodeSnippet, ProgressCircle } from "@dynatrace/strato-components/content";
import { ExternalLink } from "@dynatrace/strato-components/typography";
import { getIntentLink } from "@dynatrace-sdk/navigation";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import type { DiagramEdge, DiagramNode } from "../model/schema";
import type { EdgeStatus, NodeStatus, ProblemRow, ResolvedTimeframe, Status } from "../model/types";
import { errorMessage, formatNumber, runQuery } from "../services/dql";
import { buildProblemsDql, toProblemRow } from "../services/queryBuilder";
import { evalThreshold } from "../services/statusEngine";
import { kpiItems, kpiTitle } from "../services/kpi";
import { withUnit } from "../services/units";
import { formatDateTime, userTimezone } from "../services/time";
import { STATUS_LABEL, StatusDot, StatusGlyph } from "../canvas/statusStyle";
import { InlineMessage, SectionTitle } from "./Field";
import { SidePanel } from "./SidePanel";

export type DetailTarget = { kind: "node"; node: DiagramNode } | { kind: "edge"; edge: DiagramEdge } | null;

export interface NodeDetailDrawerProps {
  target: DetailTarget;
  nodeStatus?: NodeStatus;
  edgeStatus?: EdgeStatus;
  tf?: ResolvedTimeframe;
  onClose: () => void;
}

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

export function problemLink(p: ProblemRow): string {
  return safeIntentLink(
    { "event.id": p.eventId, "event.kind": p.eventKind },
    "dynatrace.davis.problems",
    "view-problem",
    `${environmentUrl()}/ui/apps/dynatrace.davis.problems/problem/${encodeURIComponent(p.eventId)}`,
  );
}

function notebookLink(query: string, tf?: ResolvedTimeframe): string {
  const payload: Record<string, unknown> = { "dt.query": query };
  if (tf) {
    payload["dt.timeframe"] = { from: tf.from, to: tf.to };
  }
  return safeIntentLink(payload, "dynatrace.notebooks", "view-query", `${environmentUrl()}/ui/apps/dynatrace.notebooks`);
}

function DqlBlock({ title, query, tf }: { title: string; query: string; tf?: ResolvedTimeframe }) {
  return (
    <Flex flexDirection="column" gap={4}>
      <Flex justifyContent="space-between" alignItems="center">
        <SectionTitle>{title}</SectionTitle>
        <ExternalLink href={notebookLink(query, tf)}>Open in Notebook</ExternalLink>
      </Flex>
      <CodeSnippet language="dql" lineBreaks maxHeight={260}>
        {query}
      </CodeSnippet>
    </Flex>
  );
}

function ProblemsTable({ problems }: { problems: ProblemRow[] }) {
  if (problems.length === 0) {
    return <InlineMessage kind="success">No problems for these entities in the timeframe.</InlineMessage>;
  }
  return (
    <div className="cdc-preview-table-wrap" style={{ maxHeight: 360 }}>
      <table className="cdc-kpi-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Status</th>
            <th>Category</th>
            <th>Start</th>
            <th>Affected entities</th>
          </tr>
        </thead>
        <tbody>
          {problems.map((p) => (
            <tr key={p.eventId}>
              <td>
                <ExternalLink href={problemLink(p)}>{p.displayId || p.eventId}</ExternalLink>
              </td>
              <td title={p.name}>{p.name}</td>
              <td>{p.status}</td>
              <td>{p.category}</td>
              <td>{formatDateTime(p.start)}</td>
              <td title={p.affectedIds.join(", ")}>{p.affectedIds.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusLine({ status, text }: { status: Status; text?: string }) {
  return (
    <Flex alignItems="center" gap={8}>
      <StatusGlyph status={status} size="default" />
      <span style={{ fontWeight: 600 }}>{STATUS_LABEL[status]}</span>
      {text && <span style={{ color: Colors.Text.Neutral.Subdued, fontSize: 12 }}>{text}</span>}
    </Flex>
  );
}

function NodeDetail({ node, status, tf }: { node: DiagramNode; status?: NodeStatus; tf?: ResolvedTimeframe }) {
  const [problems, setProblems] = useState<ProblemRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = node.data;
  const picked = data.kind === "entity" ? data.entities : [];
  const entityDql =
    data.kind === "entity"
      ? picked.length === 0
        ? data.entityDql
        : undefined
      : data.mode === "entities"
        ? data.entities?.dql
        : undefined;
  const problemMatch =
    data.kind === "entity" ? data.failPoint.problemMatch : data.entities?.criterion === "match" ? data.entities.problemMatch : undefined;
  const ids = status?.entityIds ?? [];
  const detailDql = tf && ids.length > 0 ? buildProblemsDql({ ids, tf, problemMatch, activeOnly: false }) : undefined;

  useEffect(() => {
    setProblems(null);
    setError(null);
    if (!detailDql) {
      return undefined;
    }
    const controller = new AbortController();
    runQuery(detailDql, tf, { signal: controller.signal })
      .then((r) => setProblems(r.records.map(toProblemRow)))
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(e));
        }
      });
    return () => controller.abort();
  }, [detailDql, tf]);

  return (
    <Flex flexDirection="column" gap={16}>
      <StatusLine
        status={status?.status ?? "loading"}
        text={
          status?.activeProblems !== undefined ? `${status.activeProblems} active problem(s) matching the filter` : undefined
        }
      />
      {status?.error && <InlineMessage kind="error">{status.error}</InlineMessage>}

      {picked.length > 0 && (
        <Flex flexDirection="column" gap={4}>
          <SectionTitle>Entities</SectionTitle>
          <table className="cdc-kpi-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Id</th>
                <th>Classic id</th>
              </tr>
            </thead>
            <tbody>
              {picked.map((e) => (
                <tr key={e.id}>
                  <td title={e.name}>{e.name}</td>
                  <td>{e.id}</td>
                  <td>{e.classicId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Flex>
      )}

      {entityDql && <DqlBlock title="Entity DQL" query={entityDql} tf={tf} />}

      {data.kind === "custom" && data.mode === "slos" && (
        <Flex flexDirection="column" gap={4}>
          <SectionTitle>SLOs</SectionTitle>
          <InlineMessage kind="info">Each SLO is evaluated using the timeframe defined in that SLO.</InlineMessage>
          <table className="cdc-kpi-table">
            <thead>
              <tr>
                <th>SLO</th>
                <th>Status</th>
                <th>Value</th>
                <th>Error budget</th>
              </tr>
            </thead>
            <tbody>
              {(status?.children ?? []).map((c) => (
                <tr key={c.key}>
                  <td title={c.message ?? c.name}>{c.name}</td>
                  <td>
                    <Flex alignItems="center" gap={4}>
                      <StatusDot status={c.status} /> {STATUS_LABEL[c.status]}
                    </Flex>
                  </td>
                  <td className="cdc-num">{c.value !== undefined ? `${formatNumber(c.value, 2)} %` : "—"}</td>
                  <td className="cdc-num">{c.errorBudget !== undefined ? `${formatNumber(c.errorBudget, 2)} %` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Flex>
      )}

      {detailDql && (
        <>
          <DqlBlock title="Problems DQL (resolved timeframe and ids)" query={detailDql} tf={tf} />
          <InlineMessage kind="info">
            The status indicator uses this same query with | filter event.status == "ACTIVE".
          </InlineMessage>
          <SectionTitle>Problems in the timeframe</SectionTitle>
          {error ? (
            <InlineMessage kind="error">{error}</InlineMessage>
          ) : problems === null ? (
            <ProgressCircle size="small" aria-label="Loading problems" />
          ) : (
            <ProblemsTable problems={problems} />
          )}
        </>
      )}

      {data.kind === "custom" && data.mode === "entities" && (status?.children?.length ?? 0) > 0 && (
        <Flex flexDirection="column" gap={4}>
          <SectionTitle>Breakdown by child</SectionTitle>
          <table className="cdc-kpi-table">
            <thead>
              <tr>
                <th>Child</th>
                <th>Id</th>
                <th>Status</th>
                <th>Active problems</th>
              </tr>
            </thead>
            <tbody>
              {(status?.children ?? []).map((c) => (
                <tr key={c.key}>
                  <td>{c.name}</td>
                  <td>{c.key}</td>
                  <td>
                    <Flex alignItems="center" gap={4}>
                      <StatusDot status={c.status} /> {STATUS_LABEL[c.status]}
                    </Flex>
                  </td>
                  <td className="cdc-num">{c.problems ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Flex>
      )}

      {data.kpi?.enabled &&
        kpiItems(data.kpi).map((item, index) => {
          const result = status?.kpi?.items.find((r) => r.id === item.id);
          const name = kpiTitle(item) ?? `KPI ${index + 1}`;
          return (
            <Flex key={item.id} flexDirection="column" gap={4}>
              <DqlBlock title={`${data.kpi?.title ?? "KPIs"} · ${name}`} query={result?.query ?? item.dql} tf={tf} />
              {result?.status === "error" && <InlineMessage kind="error">{result.error}</InlineMessage>}
              {result?.status === "ok" && (
                <table className="cdc-kpi-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lines.map((line, i) => (
                      <tr key={i}>
                        <td>{line.label}</td>
                        <td className="cdc-num">
                          {line.value === null ? "—" : withUnit(formatNumber(line.value, item.decimals), item.unit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Flex>
          );
        })}
    </Flex>
  );
}

function EdgeDetail({ edge, status, tf }: { edge: DiagramEdge; status?: EdgeStatus; tf?: ResolvedTimeframe }) {
  const kpi = edge.kpi;
  if (edge.type !== "kpi" || !kpi) {
    return <InlineMessage kind="info">Normal connection: no KPI attached.</InlineMessage>;
  }
  const t = kpi.threshold;
  const evaluated = status?.value !== undefined ? evalThreshold(status.value, t) : undefined;
  return (
    <Flex flexDirection="column" gap={16}>
      <StatusLine
        status={status?.status ?? "loading"}
        text={status?.value !== undefined ? withUnit(formatNumber(status.value, kpi.decimals), kpi.unit) : undefined}
      />
      {status?.error && <InlineMessage kind="error">{status.error}</InlineMessage>}
      <DqlBlock title="KPI DQL" query={kpi.dql} tf={tf} />
      <Flex flexDirection="column" gap={4}>
        <SectionTitle>Evaluation</SectionTitle>
        <table className="cdc-kpi-table">
          <tbody>
            <tr>
              <th>Raw value</th>
              <td>{status?.rawValue === undefined ? "—" : JSON.stringify(status.rawValue)}</td>
            </tr>
            <tr>
              <th>Column</th>
              <td>{kpi.valueField || "first numeric column"}</td>
            </tr>
            <tr>
              <th>Threshold</th>
              <td>
                {t.direction === "above" ? "bad when higher" : "bad when lower"} · warning{" "}
                {t.warning ?? "—"} · failing {t.failing ?? "—"}
              </td>
            </tr>
            <tr>
              <th>Result</th>
              <td>{evaluated ? STATUS_LABEL[evaluated] : "—"}</td>
            </tr>
          </tbody>
        </table>
      </Flex>
    </Flex>
  );
}

/** Side detail panel shown when clicking a node or a KPI edge. */
export function NodeDetailDrawer({ target, nodeStatus, edgeStatus, tf, onClose }: NodeDetailDrawerProps) {
  if (!target) {
    return null;
  }
  const title = target.kind === "node" ? target.node.data.name : target.edge.label || "KPI connection";
  return (
    <SidePanel title={title} subtitle="Details" onClose={onClose}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <SectionTitle>Applied timeframe</SectionTitle>
          <span style={{ fontSize: 13 }}>
            {tf ? `${formatDateTime(tf.from)} → ${formatDateTime(tf.to)} (${userTimezone()})` : "—"}
          </span>
        </Flex>
        {target.kind === "node" && <NodeDetail node={target.node} status={nodeStatus} tf={tf} />}
        {target.kind === "edge" && <EdgeDetail edge={target.edge} status={edgeStatus} tf={tf} />}
      </Flex>
    </SidePanel>
  );
}
