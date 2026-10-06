import * as StratoIcons from "@dynatrace/strato-icons";
import type { SvgIconProps } from "@dynatrace/strato-icons";
import type { ComponentType as ReactComponentType } from "react";
import { COMPONENT_TYPE_DEFS, COMPONENT_TYPE_IDS, type ComponentCategory } from "../model/componentTypes";
import type { ComponentType } from "../model/schema";

export type IconComponent = ReactComponentType<SvgIconProps>;

/** Export name -> component map, generated from the package (no made-up names). */
export const ICONS: Record<string, IconComponent> = Object.fromEntries(
  Object.entries(StratoIcons as Record<string, unknown>)
    .filter(([name, value]) => name.endsWith("Icon") && value !== null && (typeof value === "object" || typeof value === "function"))
    .map(([name, value]) => [name, value as IconComponent]),
);

export const ICON_NAMES: string[] = Object.keys(ICONS).sort((a, b) => a.localeCompare(b));

export const FALLBACK_ICON = "ComponentIcon";

export function resolveIcon(name: string | undefined): IconComponent {
  return (name && ICONS[name]) || ICONS[FALLBACK_ICON] || (Object.values(ICONS)[0]);
}

export function iconExists(name: string): boolean {
  return name in ICONS;
}

export const DEFAULT_ICONS: Record<ComponentType | "custom", string> = {
  ...(Object.fromEntries(COMPONENT_TYPE_IDS.map((t) => [t, COMPONENT_TYPE_DEFS[t].icon])) as Record<ComponentType, string>),
  custom: "ComponentIcon",
};

export interface IconGroup {
  id: string;
  label: string;
  keywords: string[];
}

/** Groups by keywords in the icon name (see §9 of the instructions). */
export const ICON_GROUPS: IconGroup[] = [
  { id: "database", label: "Database", keywords: ["Database", "Sql", "Mongo", "Redis", "Oracle", "Storage", "HDD", "Grail", "DataCenter", "Queues"] },
  { id: "service", label: "Service", keywords: ["Services", "Api", "Request", "Http", "Flow", "Workflow", "Connector", "Queues", "Traces", "PurePath"] },
  {
    id: "technology",
    label: "Technology",
    keywords: ["Technologies", "Java", "Dotnet", "Nodejs", "Kubernetes", "Docker", "Azure", "Aws", "Ibm", "Container", "Code", "Terminal", "OneAgent", "AppEngine", "Extensions", "LargeLanguageModel", "AIModel", "Ai"],
  },
  { id: "infra", label: "Infra", keywords: ["Host", "Process", "Container", "Cloud", "Network", "DataCenter", "RAM", "Storage", "Firewall", "Internet", "IoT", "Node", "Agent"] },
  { id: "client", label: "Client", keywords: ["Mobile", "Browser", "Application", "Apps", "Desktop", "User", "Internet", "Shop", "Account"] },
];

/** Icon groups suggested first in the icon picker, per component category (with a few per-type overrides). */
const CATEGORY_GROUPS: Record<ComponentCategory, string[]> = {
  Applications: ["service", "client", "technology"],
  Synthetic: ["client", "service", "infra"],
  Infrastructure: ["infra", "database"],
  Kubernetes: ["infra", "technology"],
  AWS: ["infra", "service", "database", "technology"],
  Azure: ["infra", "service", "database", "technology"],
  "Google Cloud": ["infra", "service", "database", "technology"],
};

export const RELEVANT_GROUPS: Record<ComponentType | "custom", string[]> = {
  ...(Object.fromEntries(COMPONENT_TYPE_IDS.map((t) => [t, CATEGORY_GROUPS[COMPONENT_TYPE_DEFS[t].category]])) as Record<ComponentType, string[]>),
  mobile: ["client"],
  frontend: ["client"],
  service: ["service", "database", "technology"],
  process: ["infra", "technology", "service"],
  host: ["infra"],
  database: ["database"],
  custom: [],
};

export function iconsForGroup(groupId: string): string[] {
  const group = ICON_GROUPS.find((g) => g.id === groupId);
  if (!group) {
    return ICON_NAMES;
  }
  const kws = group.keywords.map((k) => k.toLowerCase());
  return ICON_NAMES.filter((name) => kws.some((k) => name.toLowerCase().includes(k)));
}
