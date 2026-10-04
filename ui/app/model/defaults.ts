import type { ComponentType, CustomNodeData, Diagram, DiagramEdge, EntityNodeData, KpiBlock } from "./schema";
import { CUSTOM_DQL_TEMPLATE, ENTITY_DQL_TEMPLATES } from "../services/queryBuilder";
import { DEFAULT_ICONS } from "../services/icons";

export const COMPONENT_LABELS: Record<ComponentType, string> = {
  mobile: "Mobile",
  frontend: "Frontend",
  service: "Service",
  process: "Process",
  host: "Host",
  workload: "Workload",
};

export const COMPONENT_TYPES = Object.keys(COMPONENT_LABELS) as ComponentType[];

export const DEFAULT_KPI_BLOCK: KpiBlock = {
  enabled: true,
  title: "KPIs",
  maxRows: 5,
  dql: "timeseries rt = avg(dt.service.request.response_time, scalar: true), by: {dt.smartscape.service}\n| fieldsAdd service = getNodeName(dt.smartscape.service), avg_ms = rt / 1000\n| fields service, avg_ms\n| sort avg_ms desc\n| limit 5",
};

export const DEFAULT_EDGE_KPI_DQL =
  "timeseries r = avg(dt.service.request.response_time, scalar: true)\n| fieldsAdd v = r / 1000\n| fields v";

export function newEntityNodeData(componentType: ComponentType): EntityNodeData {
  return {
    kind: "entity",
    componentType,
    name: COMPONENT_LABELS[componentType],
    entityDql: ENTITY_DQL_TEMPLATES[componentType],
    icon: DEFAULT_ICONS[componentType],
    failPoint: { warningMin: 1, failingMin: 1 },
  };
}

export function newCustomNodeData(): CustomNodeData {
  return {
    kind: "custom",
    icon: DEFAULT_ICONS.custom,
    name: "Custom component",
    mode: "entities",
    entities: { dql: CUSTOM_DQL_TEMPLATE, subNameField: "name", criterion: "anyProblem" },
    slos: [],
    maxVisibleRows: 8,
  };
}

export function newKpiEdge(source: string, target: string, id: string): DiagramEdge {
  return {
    id,
    source,
    target,
    type: "kpi",
    direction: "forward",
    kpi: {
      dql: DEFAULT_EDGE_KPI_DQL,
      unit: "ms",
      decimals: 1,
      animated: true,
      threshold: { direction: "above", warning: 300, failing: 800 },
    },
  };
}

export function newDiagram(id: string, name: string, owner: string): Diagram {
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0",
    id,
    name,
    description: "",
    owner,
    createdAt: now,
    updatedAt: now,
    settings: {
      background: "dots",
      defaultTimeframe: { from: "now()-2h", to: "now()" },
      refreshInterval: "off",
    },
    nodes: [],
    edges: [],
  };
}

export const SAMPLE_DIAGRAM_ID = "00000000-0000-4000-8000-000000000001";

/**
 * "Sample – Online Banking": one frontend, two services, a database (entity container),
 * a KPI connection and a custom node with SLOs (filled with real tenant SLOs if any exist).
 */
export function buildSampleDiagram(owner: string, slos: Array<{ id: string; name: string }>): Diagram {
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0",
    id: SAMPLE_DIAGRAM_ID,
    name: "Sample – Online Banking",
    description: "Sample diagram created automatically",
    owner,
    createdAt: now,
    updatedAt: now,
    settings: {
      background: "dots",
      defaultTimeframe: { from: "now()-2h", to: "now()" },
      refreshInterval: "off",
    },
    nodes: [
      {
        id: "n1",
        type: "entityNode",
        position: { x: 0, y: 140 },
        data: {
          kind: "entity",
          componentType: "frontend",
          name: "Web Banking",
          entityDql: 'smartscapeNodes "FRONTEND"\n| fields id, id_classic, name\n| limit 1',
          icon: "ApplicationsIcon",
          failPoint: { warningMin: 1, failingMin: 3 },
        },
      },
      {
        id: "n2",
        type: "entityNode",
        position: { x: 380, y: 0 },
        data: {
          kind: "entity",
          componentType: "service",
          name: "Accounts API",
          entityDql: 'smartscapeNodes "SERVICE"\n| filter contains(name, "account", caseSensitive: false)\n| fields id, name',
          icon: "ServicesIcon",
          failPoint: { problemMatch: 'event.category == "ERROR"', warningMin: 1, failingMin: 2 },
          kpi: { ...DEFAULT_KPI_BLOCK, title: "Signals", maxRows: 3 },
        },
      },
      {
        id: "n3",
        type: "entityNode",
        position: { x: 380, y: 300 },
        data: {
          kind: "entity",
          componentType: "service",
          name: "Payments API",
          entityDql: 'smartscapeNodes "SERVICE"\n| filter contains(name, "payment", caseSensitive: false)\n| fields id, name',
          icon: "ServicesIcon",
          failPoint: { warningMin: 1, failingMin: 1 },
        },
      },
      {
        id: "n4",
        type: "customNode",
        position: { x: 780, y: 100 },
        size: { w: 280, h: 200 },
        data: {
          kind: "custom",
          icon: "DatabaseIcon",
          name: "Databases",
          mode: "entities",
          entities: {
            dql: 'smartscapeNodes "DB_INSTANCE_*"\n| fields id, name\n| limit 5',
            subNameField: "name",
            criterion: "anyProblem",
          },
          maxVisibleRows: 8,
        },
      },
      {
        id: "n5",
        type: "customNode",
        position: { x: 780, y: 360 },
        size: { w: 280, h: 180 },
        data: {
          kind: "custom",
          icon: "ServiceLevelObjectivesIcon",
          name: "Business SLOs",
          mode: "slos",
          slos: slos.slice(0, 3),
          maxVisibleRows: 8,
        },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", type: "normal", direction: "forward", sourceHandle: "r", targetHandle: "l" },
      { id: "e2", source: "n1", target: "n3", type: "normal", direction: "forward", sourceHandle: "r", targetHandle: "l" },
      { ...newKpiEdge("n2", "n4", "e3"), sourceHandle: "r", targetHandle: "l", label: "Response time" },
      { id: "e4", source: "n3", target: "n4", type: "normal", direction: "forward", sourceHandle: "r", targetHandle: "l" },
    ],
  };
}
