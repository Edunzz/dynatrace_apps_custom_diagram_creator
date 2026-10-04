# Data model

A diagram is a JSON document validated by the zod schema in
[`ui/app/model/schema.ts`](../ui/app/model/schema.ts), which is the single source of truth. A JSON Schema export
lives in [`skill/diagram.schema.json`](../skill/diagram.schema.json) (`npm run export:schema` regenerates it).

JSON was chosen over XML because it is React Flow's native format, validates with zod and is easy for an LLM to
generate.

## Diagram

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | `"1.0"` | |
| `id` | string | UUID v4 |
| `name` | string | |
| `description` | string, optional | |
| `owner` | string, optional | email of the creator, or `system` |
| `createdAt`, `updatedAt` | string | ISO 8601 UTC |
| `settings.background` | `dots` \| `grid` \| `blank` | default `dots` |
| `settings.defaultTimeframe` | `{ from, to }` | expressions such as `now()-2h` or ISO 8601; default last 2 h |
| `settings.refreshInterval` | `off` \| `30s` \| `1m` \| `5m` \| `15m` \| `30m` | default `off` |
| `settings.viewport` | `{ x, y, zoom }`, optional | saved with the diagram |
| `nodes` | Node[] | |
| `edges` | Edge[] | |

## Node

| Field | Type | Notes |
|---|---|---|
| `id` | string | unique in the diagram |
| `type` | `entityNode` \| `customNode` | must match `data.kind` |
| `position` | `{ x, y }` | |
| `size` | `{ w, h }`, optional | containers only (resizable) |
| `data` | EntityNodeData \| CustomNodeData | discriminated by `kind` |

### Entity component (`kind: "entity"`)

| Field | Type | Notes |
|---|---|---|
| `componentType` | `mobile` \| `frontend` \| `service` \| `process` \| `host` \| `workload` | |
| `name` | string | |
| `entityDql` | string | must return `id` (and preferably `name`); every row is used |
| `icon` | string | export name from `@dynatrace/strato-icons`, e.g. `ServicesIcon` |
| `failPoint.problemMatch` | string, optional | DQL fragment appended as `\| filter <problemMatch>` to the problem query |
| `failPoint.warningMin` | integer ≥ 1 | active problems to turn orange (default 1) |
| `failPoint.failingMin` | integer ≥ 1 | active problems to turn red (default 1; red wins when equal) |
| `kpi` | KpiBlock, optional | |

### Custom component (`kind: "custom"`)

| Field | Type | Notes |
|---|---|---|
| `icon`, `name` | string | any Strato icon |
| `mode` | `entities` \| `slos` | |
| `entities.dql` | string | must return `id` and `name` |
| `entities.subNameField` | string | column used as the child name (default `name`) |
| `entities.criterion` | `anyProblem` \| `match` | `match` counts only problems matching `problemMatch` |
| `entities.problemMatch` | string, optional | DQL filter fragment |
| `slos` | `{ id, name }[]` | SLOs evaluated in `slos` mode |
| `maxVisibleRows` | integer ≥ 1 | rows shown before scrolling (default 8) |
| `kpi` | KpiBlock, optional | |

### KPI block

| Field | Type | Notes |
|---|---|---|
| `enabled` | boolean | default `false` |
| `title` | string | default `KPIs` |
| `dql` | string | must return a table |
| `maxRows` | integer ≥ 1 | default 5 |

## Edge

| Field | Type | Notes |
|---|---|---|
| `id`, `source`, `target` | string | node ids |
| `sourceHandle`, `targetHandle` | `t` \| `r` \| `b` \| `l`, optional | node side |
| `type` | `normal` \| `kpi` | |
| `direction` | `forward` \| `backward` \| `none` | `->`, `<-` or a plain line (default `forward`) |
| `label` | string, optional | |
| `kpi.dql` | string | must return a single value |
| `kpi.valueField` | string, optional | column to read; default: first numeric column |
| `kpi.unit` | string, optional | `ms`, `%`, `req/s`… |
| `kpi.decimals` | integer 0–10 | default 2 |
| `kpi.threshold` | `{ direction: above \| below, warning: number \| null, failing: number \| null }` | `above`: bad when greater |
| `kpi.animated` | boolean | default `true` |

## Example

```json
{
  "schemaVersion": "1.0",
  "id": "8f0d6a4e-2f1b-4c55-9e4a-1f2d3c4b5a69",
  "name": "Checkout",
  "createdAt": "2026-10-04T00:00:00Z",
  "updatedAt": "2026-10-04T00:00:00Z",
  "settings": { "background": "dots", "defaultTimeframe": { "from": "now()-2h", "to": "now()" }, "refreshInterval": "off" },
  "nodes": [
    {
      "id": "web", "type": "entityNode", "position": { "x": 0, "y": 0 },
      "data": {
        "kind": "entity", "componentType": "frontend", "name": "Web shop", "icon": "ApplicationsIcon",
        "entityDql": "smartscapeNodes \"FRONTEND\"\n| fields id, id_classic, name",
        "failPoint": { "warningMin": 1, "failingMin": 2 }
      }
    },
    {
      "id": "api", "type": "entityNode", "position": { "x": 380, "y": 0 },
      "data": {
        "kind": "entity", "componentType": "service", "name": "Checkout API", "icon": "ServicesIcon",
        "entityDql": "smartscapeNodes \"SERVICE\"\n| filter contains(name, \"checkout\", caseSensitive: false)\n| fields id, name",
        "failPoint": { "problemMatch": "event.category == \"ERROR\"", "warningMin": 1, "failingMin": 1 }
      }
    }
  ],
  "edges": [
    {
      "id": "e1", "source": "web", "target": "api", "sourceHandle": "r", "targetHandle": "l",
      "type": "kpi", "direction": "forward", "label": "Response time",
      "kpi": {
        "dql": "timeseries r = avg(dt.service.request.response_time, scalar: true)\n| fieldsAdd v = r / 1000\n| fields v",
        "unit": "ms", "decimals": 1, "animated": true,
        "threshold": { "direction": "above", "warning": 300, "failing": 800 }
      }
    }
  ]
}
```

Full examples: [`skill/examples/sample-diagram.json`](../skill/examples/sample-diagram.json) and
[`skill/examples/demo-sprint-tenant.json`](../skill/examples/demo-sprint-tenant.json).

## Lookup row

Each diagram is one row of `/lookups/custom-diagram-creator/diagrams` (JSONL, one object per line):

| Column | Type | Notes |
|---|---|---|
| `id` | string | lookup key |
| `name`, `description`, `owner` | string | copies of the diagram fields, used by the list |
| `createdAt`, `updatedAt` | string | ISO 8601; `updatedAt` drives the concurrency check |
| `deleted` | boolean | only `true` for the placeholder row kept when the last diagram is deleted |
| `payload` | string | `base64(UTF-8 JSON of the whole diagram)` |

DPL parse pattern used for the upload:

```
JSON{STRING:id, STRING:name, STRING:description, STRING:owner, STRING:createdAt, STRING:updatedAt, BOOLEAN:deleted, STRING:payload}:row
```

List query used by the app:

```dql
load "/lookups/custom-diagram-creator/diagrams"
| filter isFalseOrNull(deleted)
| fields id, name, description, owner, createdAt, updatedAt
| sort updatedAt desc
```
