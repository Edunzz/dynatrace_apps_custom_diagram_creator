---
name: custom-diagram-creator-diagrams
description: Create, validate and register "Custom Diagram Creator" diagrams (Dynatrace App my.custom.diagram.creator) in the Grail lookup table /lookups/custom-diagram-creator/diagrams using dtctl. Use it when the user asks to generate an architecture diagram, add a diagram, or list, export or delete Custom Diagram Creator diagrams.
---

# Custom Diagram Creator – Diagram Skill

## Prerequisites
- `dtctl` installed and authenticated against the environment (`dtctl auth whoami`, `dtctl auth login`; switch
  context with `dtctl ctx`).
- Token/OAuth scopes: `storage:files:read`, `storage:files:write`, `storage:smartscape:read`, `storage:entities:read`,
  `storage:events:read`, `storage:buckets:read`, plus read access to the data your KPIs query (e.g.
  `storage:metrics:read`, `storage:logs:read`, `storage:user.events:read`). Deleting or replacing the file with dtctl
  also needs `storage:files:delete` (see step 5d).
- App source, docs and the component type catalog: <https://github.com/Edunzz/dynatrace_apps_custom_diagram_creator>
  (`ui/app/model/componentTypes.ts`).
- Schema: `diagram.schema.json` (this folder, generated from `ui/app/model/schema.ts` with `npm run export:schema`).
  Example — the same sample diagram the app adds to every environment: `examples/easytrade-showcase.json` (a full
  showcase built with the recipe below; its components select EasyTrade's entities by name, so it works in any
  environment running EasyTrade).
- Before writing DQL, load the `dt-dql-essentials` skill (and `dt-obs-problems` for problems). Never invent field
  names.

## Lookup format (verified)
- Path: `/lookups/custom-diagram-creator/diagrams`, `lookupField: id`.
- One JSON object per line (JSONL) with `id, name, description, owner, createdAt, updatedAt, deleted, payload`.
- `payload` = the minified diagram JSON, UTF-8, **base64**-encoded.
- DPL pattern with explicit types (with `JSON:json`, ISO dates become timestamps and any text that looks like a date
  changes):
  ```
  JSON{STRING:id, STRING:name, STRING:description, STRING:owner, STRING:createdAt, STRING:updatedAt, BOOLEAN:deleted, STRING:payload}:row
  ```
- The table is **replaced as a whole** on every write. Never drop other diagrams' rows.
- The row with id `00000000-0000-4000-8000-000000000000` is the app's metadata (`deleted: true`, never listed): its
  `description` holds the ids of the sample diagrams already added, so deleted samples don't come back. **Always
  keep it** when rewriting the table.
- Other rows with `deleted: true` only exist so the file is never empty; they can be dropped.

## Flow
1. **Understand the requested architecture**: layers, components, dependencies, KPIs.
2. **Discover real entities** (never invent ids). In newer environments `dt.entity.*` may not exist; use Smartscape:
   ```
   dtctl query 'smartscapeNodes "SERVICE" | filter contains(name, "<x>", caseSensitive: false) | fields id, name | limit 20'
   ```
   (in Windows PowerShell 5.1, escape the inner double quotes as `\"`). Each `componentType` lists fixed Smartscape
   types — the catalog is `ui/app/model/componentTypes.ts` (e.g. `service` → `SERVICE`, `workload` →
   `K8S_DEPLOYMENT`/`K8S_STATEFULSET`/`K8S_DAEMONSET`, `database` → `DB_INSTANCE_*`/`DB_DATABASE_*`, `awsLambda` →
   `AWS_LAMBDA_FUNCTION`). Pick the component type whose Smartscape types include the entity you found.
   Put the entities you found in the node's `entities` list — `[{ "id": "SERVICE-…", "name": "…" }]`, plus
   `"classicId"` when Smartscape has a different classic id (`id_classic`: frontends, synthetic monitors). That is what
   the app's entity picker writes. Use an `entityDql` instead only when the user wants the selection to stay dynamic
   (it is used only while `entities` is empty).
   **Endpoints** (`componentType: "endpoint"`) aren't Smartscape nodes: list them from the request metric and pick
   `{ "id": "<service id>", "name": "<endpoint> · <service name>", "endpoint": "<endpoint>" }` — the component shows
   the problems of the service:
   ```
   timeseries requests = sum(dt.service.request.count, scalar: true), by: {dt.smartscape.service, endpoint.name}, from: now()-7d
   | filter isNotNull(endpoint.name)
   | fieldsAdd service = getNodeName(dt.smartscape.service)
   | sort requests desc
   | fields id = toString(dt.smartscape.service), service, endpoint = endpoint.name
   ```
   **Synthetic monitors** are `browserMonitor` (`BROWSER_MONITOR`), `httpMonitor` (`HTTP_MONITOR`) and
   `networkMonitor` (`NETWORK_AVAILABILITY_MONITOR`).
   To draw real dependencies, read the topology instead of guessing it:
   - `smartscapeEdges "calls", from: now()-3d | fieldsAdd src = getNodeName(source_id), dst = getNodeName(target_id)`
     gives FRONTEND→SERVICE, SERVICE→SERVICE and PROCESS→PROCESS calls (databases and queues usually show up only
     as processes, e.g. `MSSQL`, `RabbitMQ`).
   - `smartscapeEdges "runs_on"` maps services to their processes and hosts (useful for services named only by a
     port, like `:80` or `:8080`).
   - Only draw edges you saw in the topology; leave a component unconnected rather than inventing a call.
   Check **when** there is data before choosing the timeframe — demo environments are often stopped:
   `timeseries requests = sum(dt.service.request.count), interval: 5m, from: now()-3d`.
3. **Build the JSON** following the schema:
   - `schemaVersion: "1.0"`, `id`: UUID v4, `createdAt/updatedAt`: ISO 8601 UTC.
   - `settings.defaultTimeframe` is the timeframe the diagram opens with, and `settings.refreshInterval` its
     auto-refresh (`off`, `30s`, `1m`, `5m`, `15m`, `30m`). Use a relative window (`now()-2h` … `now()`) for live
     use, or a fixed ISO window (`"2026-10-05T03:30:00.000Z"` … `"2026-10-05T05:15:00.000Z"`) when the data only
     exists in the past, e.g. a demo environment that is switched off now.
   - `entityNode` nodes (`componentType`: one of the ids in `componentTypes.ts` / the `diagram.schema.json` enum —
     frontend, mobile, service, endpoint, process, genai, browserMonitor, httpMonitor, networkMonitor, host, container,
     database, networkDevice, k8s*, workload, aws*, azure*, gcp*; plus `entities` or `entityDql`) or `customNode`
     (`mode` entities|slos; in entities mode the query must return `id` and `name`).
   - KPIs under a node: `kpi: { enabled: true, title, items: [...] }`. Each item is
     `{ id, dql, valueField?, labelMode: "text"|"column", labelText?, labelField?, unit?, decimals, maxRows }`:
     `text` shows the first row's value with `labelText` as its name; `column` shows one line per row (up to
     `maxRows`) named by `labelField`. Without `valueField`, the first numeric column is used.
     **Prefer the ready-made KPIs** of the component type — the same ones the app's "Add KPI" menu offers, defined in
     `ui/app/model/kpiPresets.ts` (services and endpoints: request count, response time avg/p95, failure rate, failed
     requests; hosts and processes: availability, CPU, memory; frontends; synthetic monitors: availability, duration,
     executions; Kubernetes and containers: CPU, memory, restarts). Copy the item from there (`dql`, `valueField:
     "value"`, `labelMode: "column"`, `labelField: "name"`, unit, decimals, `preset: "<key>"`). Their queries use
     **placeholders** that the app fills with the component's entities right before running them, so they follow the
     selection and show one line per entity:
     - `$entityIds` → the Smartscape ids, quoted and comma-separated — always inside `array(…)`;
     - `$endpointNames` → the endpoint names of an endpoint component; `$entityNames` → the entity names.
     ```
     timeseries requests = sum(dt.service.request.count, scalar: true), by: {dt.smartscape.service},
       filter: { in(toString(dt.smartscape.service), array($entityIds)) }
     | fieldsAdd name = getNodeName(dt.smartscape.service), value = requests
     | fields name, value
     | sort value desc
     ```
     Smartscape ids only match metric dimensions through `toString(…)` (`dt.smartscape.service == "SERVICE-…"`
     returns nothing). Placeholders only work in entity components; custom containers use plain DQL.
     A fixed filter by name also works, e.g. golden signals of the services behind one component:
     ```
     timeseries rt = avg(dt.service.request.response_time, scalar: true),
       filter: { dt.service.name == "BrokerService" or dt.service.name == "BrokerService.dll" }
     | fieldsAdd ms = rt / 1000
     | fields ms
     ```
     Requests: `sum(dt.service.request.count, scalar: true)`; failure rate: sum `dt.service.request.failure_count` and
     `dt.service.request.count` in one `timeseries { … }` and compute `100.0 * failures / requests`.
   - `icon`: an export name from `@dynatrace/strato-icons`. Verified: `ServicesIcon`, `DatabaseIcon`,
     `ApplicationsIcon`, `HostsIcon`, `ProcessIcon`, `ContainerIcon`, `MobileIcon`, `ComponentIcon`,
     `ServiceLevelObjectivesIcon`, `WorldmapIcon`. **Not existing**: `ApplicationIcon`, `HostIcon`, `KubernetesIcon`,
     `CloudIcon`. Full list, from the project folder:
     `node -e "console.log(Object.keys(require('@dynatrace/strato-icons')).join(' '))"`.
   - Layout: layers from left to right, x += 380 per layer, y += 180 per node within a layer.
   - Edges `normal` or `kpi`; `direction` forward|backward|none. KPI edges need
     `kpi: { dql (single value), unit, decimals, animated, threshold: { direction: above|below, warning, failing } }`.
   - Valid handles: `t`, `r`, `b`, `l` (optional).
   - Problems are matched against both `affected_entity_ids` and `smartscape.affected_entity.ids`, so classic and
     Smartscape ids both work. A component counts the problems **open at any time during the diagram's timeframe**
     (a snapshot: a past window shows what was open then, even if it closed later), so pick the timeframe the
     diagram should tell the story of.
4. **Validate**:
   - Against `diagram.schema.json` (e.g. with Python `jsonschema` or `npx ajv-cli validate -s diagram.schema.json -d diagram.json`).
   - Every query with `dtctl query`, using the diagram's own timeframe — that is how the app runs them:
     `--default-timeframe-start <from> --default-timeframe-end <to>` (ISO, or omit both for the last 2 h).
     - `entityDql` / container query → returns `id` (and `name` for containers).
     - KPI edge query → one row with a numeric value (`long` values arrive as strings).
     - KPI item query → a numeric column (`valueField`) and, in `column` mode, a name column (`labelField`). For
       queries with placeholders, replace them yourself with the component's ids before running them in `dtctl`
       (e.g. `array("SERVICE-1", "SERVICE-2")`).
   - An empty result is **not** a syntax error (the node will show gray "no data"); tell the user.
5. **Register it in the lookup**:
   a. Download the current rows:
      `dtctl query 'load "/lookups/custom-diagram-creator/diagrams"' -o json --plain`
      (large results are spilled to a local `.jsonl` file; read that path). If it fails with
      `UNKNOWN_TABULAR_FILE`, start from an empty list (the table will be created).
   b. Build the row: `{id, name, description, owner, createdAt, updatedAt, deleted: false, payload: base64(minified JSON)}`.
      Generate the JSONL with Python or a file-writing tool (PowerShell 5.1 adds a BOM). On Windows, pass Windows
      paths to Python (`/c/Users/...` becomes `C:\c\Users\...`).
   c. Upsert by `id` (drop rows with `deleted: true`, except the metadata row) and write `rows.jsonl`.
   d. Upload. `dtctl create lookup` **fails when the file already exists** and has no `--overwrite` flag:
      - New table:
        ```
        dtctl create lookup -f rows.jsonl --path /lookups/custom-diagram-creator/diagrams --lookup-field id \
          --display-name "Custom Diagram Creator diagrams" \
          --parse-pattern 'JSON{STRING:id, STRING:name, STRING:description, STRING:owner, STRING:createdAt, STRING:updatedAt, BOOLEAN:deleted, STRING:payload}:row'
        ```
      - Existing table: `dtctl delete lookup /lookups/custom-diagram-creator/diagrams -y` (needs
        `storage:files:delete`) and then the `create` above; or call the API directly with `overwrite: true`:
        ```
        curl -X POST "$DT_ENV/platform/storage/resource-store/v1/files/tabular/lookup:upload" \
          -H "Authorization: Bearer $DT_TOKEN" \
          -F 'request={"filePath":"/lookups/custom-diagram-creator/diagrams","lookupField":"id","overwrite":true,"displayName":"Custom Diagram Creator diagrams","parsePattern":"JSON{STRING:id, STRING:name, STRING:description, STRING:owner, STRING:createdAt, STRING:updatedAt, BOOLEAN:deleted, STRING:payload}:row"};type=application/json' \
          -F 'content=@rows.jsonl'
        ```
      - Without delete permissions (the usual case with `dtctl`): save the diagram as a `.json` file and upload it
        from the app (list → **Upload**). The app keeps the other diagrams and gives the upload a new id if that id
        already exists.
   e. Confirm: `dtctl query 'load "/lookups/custom-diagram-creator/diagrams" | fields id, name, updatedAt'`.
6. **Deliver** the JSON to the user (also as a file) and the registered id. The diagram opens at
   `<environment>/ui/apps/my.custom.diagram.creator/ui/diagram/<id>`.

## Showcase recipe

For a demo or "sell the value" diagram, aim for a story that reads left to right:

1. **Experience** — the frontend with RUM KPIs (sessions, user actions, frontend errors from `fetch user.events`),
   plus external callers such as partner processes.
2. **Edge** — the gateway/proxy with traffic and failure rate.
3. **APIs** — one component per business capability (login, trading, offers…), each grouping its services, with a
   golden-signals KPI block (requests, average response time, failure rate).
4. **Core services** — engine, pricing, ledger, feature flags.
5. **Data and infrastructure** — a custom container for databases and queues (one row per process), and the host
   with CPU and memory (`dt.host.cpu.usage`, `dt.host.memory.usage`).

Put KPI connections (animated, with thresholds) on the critical hops — e.g. request count from the frontend to the
gateway, and latency from the gateway to each API — and plain connections elsewhere. Keep 400 px between columns and
leave room under nodes that have KPI blocks (≈ 20 px per KPI line). Validate every query in the chosen timeframe so
nothing shows up gray.

## Other operations
- List: `load "/lookups/custom-diagram-creator/diagrams" | filter isFalseOrNull(deleted) | fields id, name, owner, updatedAt | sort updatedAt desc`.
- Delete: remove the row and upload the whole table again, keeping the metadata row (if nothing else is left, keep
  one `deleted: true` row so the file isn't empty).
- Export: read `payload`, decode base64 (UTF-8) and save it as `<name>.json`.

## Rules
- Never drop other rows when upserting.
- Never invent entity ids, SLO ids or icon names.
- Ask for confirmation before deleting diagrams or the file.
- If a query fails (syntax or permissions), report the error and don't register the diagram.
