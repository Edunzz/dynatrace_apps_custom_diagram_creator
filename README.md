# Custom Diagram Creator

A Dynatrace App (AppEngine) for drawing architecture diagrams by hand and lighting them up with live status from
Grail: components turn green, orange or red based on open Davis problems, containers aggregate many entities or
SLOs, any node can show a KPI table from DQL, and KPI connections display a value with animated flow.

Diagrams are stored as JSON in a Grail lookup table and managed like dashboards or notebooks: list, create, upload,
download, duplicate and delete.

- App ID: `my.custom.diagram.creator`
- Stack: [Dynatrace App Toolkit](https://developer.dynatrace.com/) (`dt-app`), React 18, TypeScript,
  [Strato](https://developer.dynatrace.com/design/about-strato-design-system/) components,
  [React Flow](https://reactflow.dev/) (`@xyflow/react`, MIT), [zod](https://zod.dev/), [dagre](https://github.com/dagrejs/dagre)

> The app UI is in Spanish. Code, comments and documentation are in English.

## Features

- **Canvas**: drag components from a palette, connect them from any side, zoom/pan, minimap, dots/grid/blank
  background, snap to grid, auto-layout (left to right), undo/redo, edit and view modes.
- **Dashboard-style editing**: a floating toolbar on the selected element (size, duplicate, edit, more), resize grips
  in the bottom corners, and an editor docked to the right with tabs (Data, Status, Visual, KPIs) where changes
  apply live while the diagram stays visible.
- **Entity components** (mobile, frontend, service, process, host, workload): a DQL query selects one or more
  entities; the node is colored by the number of *active* problems affecting them, with configurable warning and
  failing thresholds and an optional DQL filter on the problems.
- **Custom components (containers)**: one row per entity returned by a DQL query, or one row per selected SLO, each
  with its own status; the container aggregates them.
- **KPI blocks**: an optional table under any node, from any DQL query that returns a table.
- **KPI connections**: a DQL single value shown as a pill on the edge (value + unit), colored by a threshold
  (`above`/`below`), with dots flowing in the arrow's direction (respects `prefers-reduced-motion`).
- **Global timeframe and auto-refresh** (off, 30 s, 1/5/15/30 min) applied to every query on the page.
- **Detail panel**: click a node or KPI edge in view mode to see the applied timeframe, the full DQL (copy or open in
  Notebooks), the problems with links to the Problems app, the per-child breakdown and the KPI evaluation.
- **Storage**: diagrams live in `/lookups/custom-diagram-creator/diagrams`; the table is created with a sample
  diagram the first time the app opens. Optimistic concurrency warns when someone else saved first.
- **Agent skill**: [`skill/SKILL.md`](skill/SKILL.md) lets an AI agent with `dtctl` generate, validate and register
  diagrams.

## How status is computed

| Element | Green | Orange | Red | Gray |
|---|---|---|---|---|
| Entity component | 0 active problems | active ≥ `warningMin` and < `failingMin` | active ≥ `failingMin` (wins if both are equal) | DQL error or no entities |
| Container child (entities) | no active problem | — | ≥ 1 active problem (optionally only those matching a filter) | — |
| Container child (SLO) | SLO `SUCCESS` | SLO `WARNING` | SLO `FAILURE` | `ERROR` / no result |
| Container | all children green | some child red or orange, not all red | all children red | no children, or green mixed with unknown |
| KPI connection | within threshold | beyond `warning` | beyond `failing` | DQL error or no value |

Color is never the only signal: every status also has an icon (✓, !, ✕, ?) and a tooltip.
See [docs/architecture.md](docs/architecture.md) for the queries behind these rules.

## Requirements

- Node.js ≥ 20.19 and npm.
- A Dynatrace SaaS environment (3rd-gen platform) where you can install apps.
- The SSO user needs the permissions behind the app scopes listed below.

## Getting started

```bash
git clone https://github.com/Edunzz/dynatrace_apps_custom_diagram_creator.git
cd dynatrace_apps_custom_diagram_creator
npm install
```

Set your environment in [`app.config.json`](app.config.json):

```json
"environmentUrl": "https://<your-environment-id>.apps.dynatrace.com/"
```

Then run it locally or deploy it:

```bash
npm run start    # dev server; opens the browser and asks for SSO login
npm run deploy   # builds and installs the app in the environment
```

Open it at `https://<your-environment-id>.apps.dynatrace.com/ui/apps/my.custom.diagram.creator`.
On first use the app creates the lookup table with the **Sample – Online Banking** diagram.

## Using the app

1. **Diagram list**: search, sort, open, duplicate, download as JSON, delete (single or multiple), and upload `.json`
   files (validated against the schema; a new id is assigned if the id already exists). The ⚙ button opens storage
   administration (lists the app's lookup files and lets you delete one).
2. **New diagram**: the editor opens in edit mode. Drag a component from the palette (or click it); its editor
   opens docked on the right. Select a node to get the floating toolbar (size, duplicate, edit, ⋮ details/delete)
   and the resize grips; double-click or ✎ opens the editor. While the editor is open, clicking another element
   switches to it.
3. **Edit live**: there is no Apply button. Text and visual changes show up immediately; **Run** under a DQL editor
   previews the result, applies the query and refreshes that element's status; threshold and filter changes
   refresh it after a short pause. Each editing session is one undo step (Ctrl+Z / Ctrl+Y).
4. **Connect** two nodes by dragging from the dots on their sides; the connection editor opens to choose **Normal**
   or **KPI relation**.
5. **View mode**: nodes can't be moved; a click opens the detail panel, docked on the right.
6. **Save** (optimistic concurrency), **Save as**, **Export JSON**. An exported file can be uploaded again without
   loss.

Example entity queries (Smartscape; `fetch dt.entity.*` is deprecated and may not exist in newer environments):

```dql
smartscapeNodes "SERVICE"
| filter contains(name, "payment", caseSensitive: false)
| fields id, name
```

```dql
smartscapeNodes "FRONTEND"
| fields id, id_classic, name
```

Example KPI connection query (must return a single value):

```dql
timeseries r = avg(dt.service.request.response_time, scalar: true)
| fieldsAdd v = r / 1000
| fields v
```

## Storage

| Item | Value |
|---|---|
| Lookup path | `/lookups/custom-diagram-creator/diagrams` |
| Lookup field | `id` |
| Row columns | `id, name, description, owner, createdAt, updatedAt, deleted, payload` |
| `payload` | the diagram JSON (UTF-8) in base64 |
| Limits | 100 MB per lookup file ([Grail lookup data](https://docs.dynatrace.com/docs/platform/grail/lookup-data)); the app warns above 5 MB per diagram |

Lookup tables can only be replaced as a whole, so every save reads all rows, upserts one and uploads the full table
with `overwrite: true`. Details and the JSON format: [docs/data-model.md](docs/data-model.md).

## App scopes

| Scope | Why |
|---|---|
| `storage:entities:read`, `storage:smartscape:read` | Entity queries (classic and Smartscape) |
| `storage:events:read` | Davis problems (`dt.davis.problems`) |
| `storage:metrics:read`, `storage:logs:read`, `storage:spans:read`, `storage:bizevents:read` | KPI queries |
| `storage:buckets:read` | Required by Grail queries |
| `storage:files:read`, `storage:files:write`, `storage:files:delete` | Read, write and delete the diagrams lookup |
| `slo:slos:read`, `slo:objective-templates:read` | List and evaluate SLOs |

## Development

| Command | What it does |
|---|---|
| `npm run start` | Dev server |
| `npm run build` | Build into `dist/` |
| `npm run deploy` | Build and deploy to `environmentUrl` |
| `npm run lint` | ESLint (security and Strato import rules; must pass) |
| `npm test` | Unit tests (vitest) |
| `npm run export:schema` | Regenerate `skill/diagram.schema.json` and `skill/examples/sample-diagram.json` from the zod schema |

Project layout:

```
app.config.json            App id, version, environment and scopes
ui/
  main.tsx                 Entry point (AppRoot, router, toasts)
  app/
    App.tsx                Routes: / (list) and /diagram/:id (editor, "new" for a new diagram)
    model/                 zod schema (source of truth), runtime types, defaults and sample diagram
    services/              DQL execution, problem query builder, status engine, SLOs, lookup store, icons, time
    hooks/                 Live status, auto-refresh, undo/redo history
    canvas/                React Flow canvas, nodes, edges, status styles
    panels/                Node/edge configuration, DQL field with Run, detail panel
    toolbar/               Editor toolbar, palette, icon picker
    pages/                 Diagram list and editor
skill/                     Agent skill, JSON schema and example diagrams
scripts/                   Schema export
docs/                      Architecture and data model
```

Tests cover the threshold logic, container aggregation, the problem query builder, time expressions, the lookup
encoder/decoder, a CRUD round trip against an in-memory lookup, and JSON export/import without loss.

## Agent skill

[`skill/`](skill/) contains a skill for AI agents that use [`dtctl`](https://github.com/dynatrace-oss/dtctl):
discover real entities, build a diagram JSON that matches [`diagram.schema.json`](skill/diagram.schema.json),
validate each query and register it in the lookup. Examples:
[`sample-diagram.json`](skill/examples/sample-diagram.json) and
[`demo-sprint-tenant.json`](skill/examples/demo-sprint-tenant.json) (built only on data that exists in a nearly
empty environment: a frontend, synthetic locations and event counts).

## Known limitations

- The UI is only in Spanish.
- SLOs are evaluated with the timeframe defined in each SLO, not the page timeframe.
- `getSlos` returns the first page of SLOs only.
- Concurrent saves are detected (optimistic check on `updatedAt`) but not merged: you choose to overwrite or reload.
- There is no browser end-to-end test suite; the CRUD flow is tested at the service level.
