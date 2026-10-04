---
name: custom-diagram-creator-diagrams
description: Create, validate and register "Custom Diagram Creator" diagrams (Dynatrace App my.custom.diagram.creator) in the Grail lookup table /lookups/custom-diagram-creator/diagrams using dtctl. Use it when the user asks to generate an architecture diagram, add a diagram, or list, export or delete Custom Diagram Creator diagrams.
---

# Custom Diagram Creator – Diagram Skill

## Prerequisites
- `dtctl` installed and authenticated against the environment (`dtctl auth whoami`, `dtctl auth login`; switch
  context with `dtctl ctx`).
- Token/OAuth scopes: `storage:files:read`, `storage:files:write`, `storage:smartscape:read`, `storage:entities:read`,
  `storage:events:read`, `storage:buckets:read`. Deleting or replacing the file with dtctl also needs
  `storage:files:delete` (see step 5d).
- Schema: `diagram.schema.json` (this folder, generated from `ui/app/model/schema.ts` with `npm run export:schema`).
  Examples: `examples/sample-diagram.json`, `examples/demo-sprint-tenant.json`.
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
- If the table would end up empty, the app keeps a single row with `deleted: true` and `payload: ""`.

## Flow
1. **Understand the requested architecture**: layers, components, dependencies, KPIs.
2. **Discover real entities** (never invent ids). In newer environments `dt.entity.*` may not exist; use Smartscape:
   ```
   dtctl query 'smartscapeNodes "SERVICE" | filter contains(name, "<x>", caseSensitive: false) | fields id, name | limit 20'
   ```
   (in Windows PowerShell 5.1, escape the inner double quotes as `\"`). Useful types: `SERVICE`, `PROCESS`, `HOST`,
   `FRONTEND` (also returns `id_classic`), `K8S_DEPLOYMENT`, `K8S_STATEFULSET`, `K8S_DAEMONSET`, `DB_INSTANCE_*`.
   Use the query as the node's `entityDql` (not fixed ids, unless the user asks for them).
3. **Build the JSON** following the schema:
   - `schemaVersion: "1.0"`, `id`: UUID v4, `createdAt/updatedAt`: ISO 8601 UTC.
   - `entityNode` nodes (`componentType` ∈ mobile|frontend|service|process|host|workload) or `customNode`
     (`mode` entities|slos; in entities mode the query must return `id` and `name`).
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
     Smartscape ids both work.
4. **Validate**:
   - Against `diagram.schema.json` (e.g. with Python `jsonschema` or `npx ajv-cli validate -s diagram.schema.json -d diagram.json`).
   - Every query with `dtctl query`:
     - `entityDql` / container query → returns `id` (and `name` for containers).
     - KPI edge query → one row with a numeric value (`long` values arrive as strings).
     - KPI block query → a table.
   - An empty result is **not** a syntax error (the node will show gray "no data"); tell the user.
5. **Register it in the lookup**:
   a. Download the current rows:
      `dtctl query 'load "/lookups/custom-diagram-creator/diagrams"' -o json --plain`
      (large results are spilled to a local `.jsonl` file; read that path). If it fails with
      `UNKNOWN_TABULAR_FILE`, start from an empty list (the table will be created).
   b. Build the row: `{id, name, description, owner, createdAt, updatedAt, deleted: false, payload: base64(minified JSON)}`.
      Generate the JSONL with Python or a file-writing tool (PowerShell 5.1 adds a BOM). On Windows, pass Windows
      paths to Python (`/c/Users/...` becomes `C:\c\Users\...`).
   c. Upsert by `id` (drop rows with `deleted: true`) and write `rows.jsonl`.
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
      - Without delete permissions: upload the diagram JSON from the app (list → **Subir**).
   e. Confirm: `dtctl query 'load "/lookups/custom-diagram-creator/diagrams" | fields id, name, updatedAt'`.
6. **Deliver** the JSON to the user (also as a file) and the registered id. The diagram opens at
   `<environment>/ui/apps/my.custom.diagram.creator/ui/diagram/<id>`.

## Other operations
- List: `load "/lookups/custom-diagram-creator/diagrams" | filter isFalseOrNull(deleted) | fields id, name, owner, updatedAt | sort updatedAt desc`.
- Delete: remove the row and upload the whole table again (if it becomes empty, keep one `deleted: true` row).
- Export: read `payload`, decode base64 (UTF-8) and save it as `<name>.json`.

## Rules
- Never drop other rows when upserting.
- Never invent entity ids, SLO ids or icon names.
- Ask for confirmation before deleting diagrams or the file.
- If a query fails (syntax or permissions), report the error and don't register the diagram.
