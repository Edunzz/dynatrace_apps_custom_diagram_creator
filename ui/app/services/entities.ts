import type { ComponentType, EntityRef } from "../model/schema";
import { asText, runQuery } from "./dql";

export interface EntityOption extends EntityRef {
  /** Smartscape node type, shown for workloads (deployment, statefulset, daemonset). */
  type?: string;
}

/** Entities that existed in the last 7 days, per component type (Smartscape; dt.entity.* is deprecated). */
export const ENTITY_LIST_DQL: Record<ComponentType, string> = {
  service: 'smartscapeNodes "SERVICE", from: now()-7d\n| fields id, name\n| sort name asc\n| limit 2000',
  process: 'smartscapeNodes "PROCESS", from: now()-7d\n| fields id, name\n| sort name asc\n| limit 2000',
  host: 'smartscapeNodes "HOST", from: now()-7d\n| fields id, name\n| sort name asc\n| limit 2000',
  workload:
    'smartscapeNodes "K8S_DEPLOYMENT", "K8S_STATEFULSET", "K8S_DAEMONSET", from: now()-7d\n| fields id, name, type\n| sort name asc\n| limit 2000',
  frontend: 'smartscapeNodes "FRONTEND", from: now()-7d\n| filter frontend.type == "web"\n| fields id, id_classic, name\n| sort name asc\n| limit 2000',
  mobile: 'smartscapeNodes "FRONTEND", from: now()-7d\n| filter frontend.type != "web"\n| fields id, id_classic, name\n| sort name asc\n| limit 2000',
};

export async function listEntities(type: ComponentType, signal?: AbortSignal): Promise<EntityOption[]> {
  const result = await runQuery(ENTITY_LIST_DQL[type], undefined, { signal, maxResultRecords: 2000 });
  return result.records.map((r) => {
    const option: EntityOption = { id: asText(r.id), name: asText(r.name) || asText(r.id) };
    const classicId = asText(r.id_classic);
    if (classicId) {
      option.classicId = classicId;
    }
    const nodeType = asText(r.type);
    if (nodeType) {
      option.type = nodeType;
    }
    return option;
  });
}

/** Ids used to match problems: Smartscape ids plus classic ids when known. */
export function pickedEntityIds(entities: EntityRef[]): string[] {
  return entities.flatMap((e) => (e.classicId ? [e.id, e.classicId] : [e.id]));
}
