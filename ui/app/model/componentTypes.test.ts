import { describe, expect, it, vi } from "vitest";

vi.mock("@dynatrace-sdk/client-query", () => ({ queryExecutionClient: {} }));

import { COMPONENT_CATEGORIES, COMPONENT_TYPE_DEFS, COMPONENT_TYPE_IDS, matchesComponentType } from "./componentTypes";
import { ComponentType } from "./schema";
import { ICONS } from "../services/icons";
import { entityListDql, smartscapeTypeLabel } from "../services/entities";

describe("component types", () => {
  it("keeps the types of earlier versions", () => {
    for (const t of ["mobile", "frontend", "service", "process", "host", "workload"]) {
      expect(ComponentType.safeParse(t).success, t).toBe(true);
    }
  });

  it("every type has a known category, Smartscape types and an existing icon", () => {
    for (const t of COMPONENT_TYPE_IDS) {
      const def = COMPONENT_TYPE_DEFS[t];
      expect(COMPONENT_CATEGORIES, t).toContain(def.category);
      expect(def.smartscape.length, t).toBeGreaterThan(0);
      expect(ICONS[def.icon], `${t}: ${def.icon}`).toBeDefined();
    }
  });

  it("leaves synthetic monitors out", () => {
    const all = COMPONENT_TYPE_IDS.flatMap((t) => COMPONENT_TYPE_DEFS[t].smartscape);
    expect(all.filter((s) => /MONITOR|SYNTHETIC/.test(s))).toEqual([]);
  });

  it("filters by label, category or Smartscape type", () => {
    expect(matchesComponentType("awsLambda", "lambda")).toBe(true);
    expect(matchesComponentType("awsLambda", "aws")).toBe(true);
    expect(matchesComponentType("k8sPod", "K8S_POD")).toBe(true);
    expect(matchesComponentType("host", "kubernetes")).toBe(false);
    expect(matchesComponentType("host", "  ")).toBe(true);
  });
});

describe("entityListDql", () => {
  it("lists the type's Smartscape nodes of the last 7 days, with its filter", () => {
    expect(entityListDql("mobile")).toBe(
      'smartscapeNodes "FRONTEND", from: now()-7d\n| filter frontend.type != "web"\n| fields id, id_classic, name, type\n| sort name asc\n| limit 2000',
    );
    expect(entityListDql("database")).toContain('smartscapeNodes "DB_INSTANCE_*", "DB_DATABASE_*", from: now()-7d');
  });

  it("searches name and id on the server with an escaped text", () => {
    const dql = entityListDql("service", ' pay"ments ');
    expect(dql).toContain('| filter contains(name, "pay\\"ments", caseSensitive: false) or contains(toString(id), "pay\\"ments", caseSensitive: false)');
  });

  it("names Smartscape types readably", () => {
    expect(smartscapeTypeLabel("K8S_STATEFULSET")).toBe("StatefulSet");
    expect(smartscapeTypeLabel("DB_INSTANCE_POSTGRES")).toBe("PostgreSQL instance");
    expect(smartscapeTypeLabel("DB_DATABASE_MSSQL")).toBe("SQL Server database");
    expect(smartscapeTypeLabel("DB_INSTANCE_DB2")).toBe("Db2 instance");
    expect(smartscapeTypeLabel("AWS_SQS_QUEUE")).toBe("AWS_SQS_QUEUE");
  });
});
