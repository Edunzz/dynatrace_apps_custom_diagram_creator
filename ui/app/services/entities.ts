import { COMPONENT_TYPE_DEFS, type ComponentTypeDef } from "../model/componentTypes";
import type { ComponentType, EntityRef } from "../model/schema";
import { asText, dqlString, runQuery } from "./dql";

export interface EntityOption extends EntityRef {
  /** Smartscape node type, shown when a component type covers several (e.g. deployment, statefulset). */
  type?: string;
}

/** Key of a pick in the picker: endpoints of one service share its id, so the endpoint name is part of it. */
export function entityKey(e: EntityRef): string {
  return e.endpoint ? `${e.id}|${e.endpoint}` : e.id;
}

/** Entities listed per query. Larger environments are searched on the server as you type. */
export const ENTITY_LIST_LIMIT = 2000;

/**
 * Entities of a component type that existed in the last 7 days (Smartscape; dt.entity.* is deprecated).
 * With a search text, only the entities whose name or id contains it.
 */
export function entityListDql(type: ComponentType, search = ""): string {
  const def: ComponentTypeDef = COMPONENT_TYPE_DEFS[type];
  const text = search.trim();
  return [
    `smartscapeNodes ${def.smartscape.map((t) => `"${t}"`).join(", ")}, from: now()-7d`,
    ...(def.filter ? [`| filter ${def.filter}`] : []),
    ...(text
      ? [`| filter contains(name, ${dqlString(text)}, caseSensitive: false) or contains(toString(id), ${dqlString(text)}, caseSensitive: false)`]
      : []),
    "| fields id, id_classic, name, type",
    "| sort name asc",
    `| limit ${ENTITY_LIST_LIMIT}`,
  ].join("\n");
}

/**
 * Endpoints with requests in the last 7 days, busiest first, with the id and name of their service. Endpoints aren't
 * Smartscape nodes: they come from the `endpoint.name` dimension of the service request metric.
 */
export function endpointListDql(search = ""): string {
  const text = search.trim();
  return [
    "timeseries requests = sum(dt.service.request.count, scalar: true), by: {dt.smartscape.service, endpoint.name}, from: now()-7d",
    "| filter isNotNull(endpoint.name)",
    "| fieldsAdd service = getNodeName(dt.smartscape.service)",
    ...(text
      ? [`| filter contains(endpoint.name, ${dqlString(text)}, caseSensitive: false) or contains(service, ${dqlString(text)}, caseSensitive: false)`]
      : []),
    "| sort requests desc",
    `| limit ${ENTITY_LIST_LIMIT}`,
    "| fields id = toString(dt.smartscape.service), service, endpoint = endpoint.name",
  ].join("\n");
}

export async function listEntities(type: ComponentType, signal?: AbortSignal, search = ""): Promise<EntityOption[]> {
  if ((COMPONENT_TYPE_DEFS[type] as ComponentTypeDef).listing === "endpoints") {
    const endpoints = await runQuery(endpointListDql(search), undefined, { signal, maxResultRecords: ENTITY_LIST_LIMIT });
    return endpoints.records.map((r) => ({
      id: asText(r.id),
      name: `${asText(r.endpoint)} · ${asText(r.service)}`,
      endpoint: asText(r.endpoint),
    }));
  }
  const result = await runQuery(entityListDql(type, search), undefined, { signal, maxResultRecords: ENTITY_LIST_LIMIT });
  return result.records.map((r) => {
    const option: EntityOption = { id: asText(r.id), name: asText(r.name) || asText(r.id) };
    const classicId = asText(r.id_classic);
    if (classicId && classicId !== option.id) {
      option.classicId = classicId;
    }
    const nodeType = asText(r.type);
    if (nodeType) {
      option.type = nodeType;
    }
    return option;
  });
}

const TYPE_LABELS: Record<string, string> = {
  K8S_DEPLOYMENT: "Deployment",
  K8S_STATEFULSET: "StatefulSet",
  K8S_DAEMONSET: "DaemonSet",
  GENAI_SERVICE: "Service",
  GENAI_AGENT: "Agent",
  GENAI_MODEL: "Model",
};

const DB_ENGINES: Record<string, string> = {
  POSTGRES: "PostgreSQL",
  MYSQL: "MySQL",
  MSSQL: "SQL Server",
  ORACLE: "Oracle",
  HANA: "SAP HANA",
};

/** Readable Smartscape type: known names, DB_INSTANCE_POSTGRES → "PostgreSQL instance", otherwise the raw type. */
export function smartscapeTypeLabel(type: string): string {
  if (TYPE_LABELS[type]) {
    return TYPE_LABELS[type];
  }
  const db = /^DB_(INSTANCE|DATABASE)_(.+)$/.exec(type);
  if (db) {
    const engine = DB_ENGINES[db[2]] ?? db[2].charAt(0) + db[2].slice(1).toLowerCase();
    return `${engine} ${db[1] === "INSTANCE" ? "instance" : "database"}`;
  }
  return type;
}

/** Ids used to match problems: Smartscape ids plus classic ids when known. */
export function pickedEntityIds(entities: EntityRef[]): string[] {
  // Several endpoints can share a service id.
  return Array.from(new Set(entities.flatMap((e) => (e.classicId ? [e.id, e.classicId] : [e.id]))));
}
