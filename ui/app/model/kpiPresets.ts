import type { ComponentTypeId } from "./componentTypes";
import type { KpiItem } from "./schema";

/**
 * Ready-made KPIs per component type. Their queries use placeholders that the status engine replaces with the
 * component's selected entities right before running them (see services/kpiScope.ts):
 * - `$entityIds`     → the Smartscape ids, quoted and comma-separated: use as `array($entityIds)`;
 * - `$endpointNames` → the endpoint names of an endpoint component.
 * Every KPI shows one line per selected entity. Every query here was checked against real environments.
 */
export interface KpiPreset {
  key: string;
  label: string;
  /** One line shown in the "Add KPI" menu. */
  description: string;
  /** Added to new components of the type. */
  isDefault?: boolean;
  item: Omit<KpiItem, "id">;
}

interface MetricPreset {
  key: string;
  label: string;
  description: string;
  isDefault?: boolean;
  /** Body of `timeseries`: one aggregation (`v = …`) or several in braces. */
  series: string;
  /** Value expression computed from the series (scalar aggregations) — or `arrayAvg(v)` for per-minute sums. */
  value: string;
  unit: string;
  decimals: number;
}

/**
 * One line per selected entity: `by:` the entity's Smartscape dimension (or several, for component types that cover
 * several Smartscape types), filtered to the selection.
 */
function perEntity(dims: string | string[], p: MetricPreset, extraFilter = "", nameExpr?: string, extraBy = ""): KpiPreset {
  const list = Array.isArray(dims) ? dims : [dims];
  const inSelection = list.map((d) => `in(toString(${d}), array($entityIds))`);
  const filter = list.length > 1 ? `(${inSelection.join(" or ")})` : inSelection[0];
  const name = nameExpr ?? (list.length > 1 ? `coalesce(${list.map((d) => `getNodeName(${d})`).join(", ")})` : `getNodeName(${list[0]})`);
  const dql = [
    `timeseries ${p.series}, by: {${list.join(", ")}${extraBy}},`,
    `  filter: { ${filter}${extraFilter} }`,
    `| fieldsAdd name = ${name}, value = ${p.value}`,
    "| fields name, value",
    "| sort value desc",
  ].join("\n");
  return {
    key: p.key,
    label: p.label,
    description: p.description,
    isDefault: p.isDefault,
    item: {
      dql,
      title: p.label,
      valueField: "value",
      labelMode: "column",
      labelField: "name",
      unit: p.unit,
      decimals: p.decimals,
      maxRows: 10,
      preset: p.key,
    },
  };
}

// ---------------------------------------------------------------- services and endpoints

const SERVICE_METRICS: MetricPreset[] = [
  {
    key: "requests",
    label: "Request count",
    description: "Requests in the timeframe",
    isDefault: true,
    series: "requests = sum(dt.service.request.count, scalar: true)",
    value: "requests",
    unit: "count",
    decimals: 0,
  },
  {
    key: "response-time",
    label: "Response time (avg)",
    description: "Average server response time",
    isDefault: true,
    series: "rt = avg(dt.service.request.response_time, scalar: true)",
    value: "rt / 1000",
    unit: "ms",
    decimals: 1,
  },
  {
    key: "failure-rate",
    label: "Failure rate",
    description: "Failed requests / all requests",
    isDefault: true,
    series:
      "{ failures = sum(dt.service.request.failure_count, scalar: true), requests = sum(dt.service.request.count, scalar: true) }",
    value: "100.0 * failures / requests",
    unit: "%",
    decimals: 2,
  },
  {
    key: "response-time-p95",
    label: "Response time (p95)",
    description: "95th percentile of the server response time",
    series: "p95 = percentile(dt.service.request.response_time, 95, scalar: true)",
    value: "p95 / 1000",
    unit: "ms",
    decimals: 1,
  },
  {
    key: "failures",
    label: "Failed requests",
    description: "Failed requests in the timeframe",
    series: "failures = sum(dt.service.request.failure_count, scalar: true)",
    value: "failures",
    unit: "count",
    decimals: 0,
  },
];

const SERVICE = "dt.smartscape.service";
const servicePresets = SERVICE_METRICS.map((m) => perEntity(SERVICE, { ...m, key: `service.${m.key}` }));
const endpointPresets = SERVICE_METRICS.map((m) =>
  perEntity(SERVICE, { ...m, key: `endpoint.${m.key}` }, " and in(endpoint.name, array($endpointNames))", "endpoint.name", ", endpoint.name"),
);

// ---------------------------------------------------------------- hosts and processes

const HOST = "dt.smartscape.host";
const hostPresets: KpiPreset[] = [
  { key: "host.availability", label: "Availability", description: "Share of time the host was up", isDefault: true, series: "a = avg(dt.host.availability, scalar: true)", value: "100 * a", unit: "%", decimals: 2 },
  { key: "host.cpu", label: "CPU usage", description: "Average CPU usage", isDefault: true, series: "cpu = avg(dt.host.cpu.usage, scalar: true)", value: "cpu", unit: "%", decimals: 1 },
  { key: "host.memory", label: "Memory usage", description: "Average memory usage", isDefault: true, series: "mem = avg(dt.host.memory.usage, scalar: true)", value: "mem", unit: "%", decimals: 1 },
  { key: "host.disk", label: "Disk usage", description: "Average used disk space", series: "disk = avg(dt.host.disk.used.percent, scalar: true)", value: "disk", unit: "%", decimals: 1 },
].map((m) => perEntity(HOST, m));

const PROCESS = "dt.smartscape.process";
const processPresets: KpiPreset[] = [
  { key: "process.availability", label: "Availability", description: "Share of time the process was running", isDefault: true, series: "a = avg(dt.process.availability, scalar: true)", value: "100 * a", unit: "%", decimals: 2 },
  { key: "process.cpu", label: "CPU usage", description: "Average CPU usage", isDefault: true, series: "cpu = avg(dt.process.cpu.usage, scalar: true)", value: "cpu", unit: "%", decimals: 1 },
  { key: "process.memory", label: "Memory usage", description: "Average memory usage", isDefault: true, series: "mem = avg(dt.process.memory.usage, scalar: true)", value: "mem", unit: "%", decimals: 1 },
].map((m) => perEntity(PROCESS, m));

// ---------------------------------------------------------------- frontends

const FRONTEND = "dt.smartscape.frontend";
const frontendPresets: KpiPreset[] = [
  { key: "frontend.user-actions", label: "User actions", description: "User actions in the timeframe", isDefault: true, series: "actions = sum(dt.frontend.user_action.count, scalar: true)", value: "actions", unit: "count", decimals: 0 },
  { key: "frontend.action-duration", label: "User action duration", description: "Average user action duration", isDefault: true, series: "d = avg(dt.frontend.user_action.duration, scalar: true)", value: "d", unit: "ms", decimals: 0 },
  { key: "frontend.errors", label: "Errors", description: "Frontend errors in the timeframe", isDefault: true, series: "errors = sum(dt.frontend.error.count, scalar: true)", value: "errors", unit: "errors", decimals: 0 },
  { key: "frontend.lcp", label: "Largest contentful paint", description: "Average LCP (Core Web Vital)", series: "lcp = avg(dt.frontend.web.page.largest_contentful_paint, scalar: true)", value: "lcp", unit: "ms", decimals: 0 },
  { key: "frontend.requests", label: "Requests", description: "Requests sent by the frontend", series: "requests = sum(dt.frontend.request.count, scalar: true)", value: "requests", unit: "count", decimals: 0 },
].map((m) => perEntity(FRONTEND, m));

const mobilePresets: KpiPreset[] = [
  { key: "mobile.user-actions", label: "User actions", description: "User actions in the timeframe", isDefault: true, series: "actions = sum(dt.frontend.user_action.count, scalar: true)", value: "actions", unit: "count", decimals: 0 },
  { key: "mobile.app-starts", label: "App starts", description: "App starts in the timeframe", isDefault: true, series: "starts = sum(dt.frontend.mobile.app_start.count, scalar: true)", value: "starts", unit: "count", decimals: 0 },
  { key: "mobile.errors", label: "Errors", description: "Errors and crashes reported", isDefault: true, series: "errors = sum(dt.frontend.error.count, scalar: true)", value: "errors", unit: "errors", decimals: 0 },
  { key: "mobile.app-start-duration", label: "App start duration", description: "Average app start time", series: "d = avg(dt.frontend.mobile.app_start.duration, scalar: true)", value: "d", unit: "ms", decimals: 0 },
].map((m) => perEntity(FRONTEND, m));

// ---------------------------------------------------------------- synthetic monitors

function syntheticPresets(type: string, dim: string, metric: string, durationMetric: string, durationLabel: string): KpiPreset[] {
  return [
    { key: `${type}.availability`, label: "Availability", description: "Successful executions", isDefault: true, series: `a = avg(dt.synthetic.${metric}.availability, scalar: true)`, value: "a", unit: "%", decimals: 2 },
    { key: `${type}.duration`, label: durationLabel, description: "Average execution time", isDefault: true, series: `d = avg(dt.synthetic.${metric}.${durationMetric}, scalar: true)`, value: "d", unit: "ms", decimals: 0 },
    { key: `${type}.executions`, label: "Executions", description: "Executions in the timeframe", series: `n = sum(dt.synthetic.${metric}.executions, scalar: true)`, value: "n", unit: "count", decimals: 0 },
  ].map((m) => perEntity(dim, m));
}

// ---------------------------------------------------------------- Kubernetes

/** Container metrics summed per entity, averaged over the timeframe (CPU in millicores, memory in MB). */
function k8sPresets(type: string, dim: string | string[], withRestarts: boolean): KpiPreset[] {
  const presets: MetricPreset[] = [
    { key: `${type}.cpu`, label: "CPU usage", description: "Average CPU of its containers", isDefault: true, series: "cpu = sum(dt.kubernetes.container.cpu_usage)", value: "arrayAvg(cpu)", unit: "mCPU", decimals: 0 },
    { key: `${type}.memory`, label: "Memory (working set)", description: "Average memory of its containers", isDefault: true, series: "mem = sum(dt.kubernetes.container.memory_working_set)", value: "arrayAvg(mem) / 1048576", unit: "MB", decimals: 0 },
  ];
  if (withRestarts) {
    presets.push({ key: `${type}.restarts`, label: "Container restarts", description: "Restarts in the timeframe", isDefault: true, series: "r = sum(dt.kubernetes.container.restarts, scalar: true)", value: "r", unit: "count", decimals: 0 });
  }
  return presets.map((m) => perEntity(dim, m));
}

export const KPI_PRESETS: Partial<Record<ComponentTypeId, KpiPreset[]>> = {
  service: servicePresets,
  endpoint: endpointPresets,
  process: processPresets,
  host: hostPresets,
  frontend: frontendPresets,
  mobile: mobilePresets,
  browserMonitor: syntheticPresets("browser", "dt.smartscape.browser_monitor", "browser", "duration", "Duration"),
  httpMonitor: syntheticPresets("http", "dt.smartscape.http_monitor", "http", "duration", "Duration"),
  networkMonitor: syntheticPresets("network", "dt.smartscape.network_availability_monitor", "multi_protocol", "execution_time", "Execution time"),
  k8sCluster: k8sPresets("k8s-cluster", "dt.smartscape.k8s_cluster", false),
  k8sNamespace: k8sPresets("k8s-namespace", "dt.smartscape.k8s_namespace", false),
  k8sNode: k8sPresets("k8s-node", "dt.smartscape.k8s_node", false),
  k8sPod: k8sPresets("k8s-pod", "dt.smartscape.k8s_pod", true),
  // Container restarts don't carry workload dimensions, so workloads get CPU and memory only.
  workload: k8sPresets("k8s-workload", ["dt.smartscape.k8s_deployment", "dt.smartscape.k8s_statefulset", "dt.smartscape.k8s_daemonset"], false),
  container: k8sPresets("container", "dt.smartscape.container", true),
};

export function findPreset(key: string | undefined): KpiPreset | undefined {
  return key ? Object.values(KPI_PRESETS).flat().find((p) => p.key === key) : undefined;
}

export function kpiPresetsFor(type: ComponentTypeId): KpiPreset[] {
  return KPI_PRESETS[type] ?? [];
}

/** KPI block for a new component: the type's default presets, or none. */
export function defaultKpiItems(type: ComponentTypeId): KpiItem[] {
  return kpiPresetsFor(type)
    .filter((p) => p.isDefault)
    .map((p, i) => ({ ...p.item, id: `k${i + 1}` }));
}
