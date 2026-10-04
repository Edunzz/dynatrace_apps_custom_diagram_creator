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
import { formatDateTime, userTimezone } from "../services/time";
import { ResultTable } from "../canvas/nodes/ResultTable";
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
        <ExternalLink href={notebookLink(query, tf)}>Abrir en Notebook</ExternalLink>
      </Flex>
      <CodeSnippet language="dql" lineBreaks maxHeight={260}>
        {query}
      </CodeSnippet>
    </Flex>
  );
}

function ProblemsTable({ problems }: { problems: ProblemRow[] }) {
  if (problems.length === 0) {
    return <InlineMessage kind="success">No hay problems para estas entidades en el timeframe.</InlineMessage>;
  }
  return (
    <div className="cdc-preview-table-wrap" style={{ maxHeight: 360 }}>
      <table className="cdc-kpi-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Título</th>
            <th>Estado</th>
            <th>Categoría</th>
            <th>Inicio</th>
            <th>Entidades afectadas</th>
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
  const entityDql = data.kind === "entity" ? data.entityDql : data.mode === "entities" ? data.entities?.dql : undefined;
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
          status?.activeProblems !== undefined ? `${status.activeProblems} problem(s) activo(s) que cumplen el filtro` : undefined
        }
      />
      {status?.error && <InlineMessage kind="error">{status.error}</InlineMessage>}

      {entityDql && <DqlBlock title="DQL de entidades" query={entityDql} tf={tf} />}

      {data.kind === "custom" && data.mode === "slos" && (
        <Flex flexDirection="column" gap={4}>
          <SectionTitle>SLOs</SectionTitle>
          <InlineMessage kind="info">Cada SLO se evalúa con el timeframe definido en el propio SLO.</InlineMessage>
          <table className="cdc-kpi-table">
            <thead>
              <tr>
                <th>SLO</th>
                <th>Estado</th>
                <th>Valor</th>
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
          <DqlBlock title="DQL de problems (timeframe e ids resueltos)" query={detailDql} tf={tf} />
          <InlineMessage kind="info">
            El semáforo usa esta misma consulta con | filter event.status == "ACTIVE".
          </InlineMessage>
          <SectionTitle>Problems en el timeframe</SectionTitle>
          {error ? (
            <InlineMessage kind="error">{error}</InlineMessage>
          ) : problems === null ? (
            <ProgressCircle size="small" aria-label="Cargando problems" />
          ) : (
            <ProblemsTable problems={problems} />
          )}
        </>
      )}

      {data.kind === "custom" && data.mode === "entities" && (status?.children?.length ?? 0) > 0 && (
        <Flex flexDirection="column" gap={4}>
          <SectionTitle>Desglose por subcomponente</SectionTitle>
          <table className="cdc-kpi-table">
            <thead>
              <tr>
                <th>Subcomponente</th>
                <th>Id</th>
                <th>Estado</th>
                <th>Problems activos</th>
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

      {data.kpi?.enabled && (
        <Flex flexDirection="column" gap={4}>
          <DqlBlock title={`DQL del bloque KPI «${data.kpi.title}»`} query={data.kpi.dql} tf={tf} />
          {status?.kpi?.status === "error" && <InlineMessage kind="error">{status.kpi.error}</InlineMessage>}
          {status?.kpi?.result && (
            <div className="cdc-preview-table-wrap">
              <ResultTable result={status.kpi.result} />
            </div>
          )}
        </Flex>
      )}
    </Flex>
  );
}

function EdgeDetail({ edge, status, tf }: { edge: DiagramEdge; status?: EdgeStatus; tf?: ResolvedTimeframe }) {
  const kpi = edge.kpi;
  if (edge.type !== "kpi" || !kpi) {
    return <InlineMessage kind="info">Conexión normal: no tiene KPI asociado.</InlineMessage>;
  }
  const t = kpi.threshold;
  const evaluated = status?.value !== undefined ? evalThreshold(status.value, t) : undefined;
  return (
    <Flex flexDirection="column" gap={16}>
      <StatusLine
        status={status?.status ?? "loading"}
        text={status?.value !== undefined ? `${formatNumber(status.value, kpi.decimals)} ${kpi.unit ?? ""}` : undefined}
      />
      {status?.error && <InlineMessage kind="error">{status.error}</InlineMessage>}
      <DqlBlock title="DQL del KPI" query={kpi.dql} tf={tf} />
      <Flex flexDirection="column" gap={4}>
        <SectionTitle>Evaluación</SectionTitle>
        <table className="cdc-kpi-table">
          <tbody>
            <tr>
              <th>Valor crudo</th>
              <td>{status?.rawValue === undefined ? "—" : JSON.stringify(status.rawValue)}</td>
            </tr>
            <tr>
              <th>Columna</th>
              <td>{kpi.valueField || "primera columna numérica"}</td>
            </tr>
            <tr>
              <th>Umbral</th>
              <td>
                {t.direction === "above" ? "malo si está por encima" : "malo si está por debajo"} · warning{" "}
                {t.warning ?? "—"} · failing {t.failing ?? "—"}
              </td>
            </tr>
            <tr>
              <th>Resultado</th>
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
  const title = target.kind === "node" ? target.node.data.name : target.edge.label || "Conexión KPI";
  return (
    <SidePanel title={title} subtitle="Detalle" onClose={onClose}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <SectionTitle>Timeframe aplicado</SectionTitle>
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
