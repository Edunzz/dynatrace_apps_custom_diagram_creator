# Architecture

This document explains how Custom Diagram Creator turns a diagram definition into live status, and how diagrams are
stored. For the JSON format itself see [data-model.md](data-model.md).

## Overview

```
┌──────────────┐    ┌──────────────────────┐    ┌───────────────────────────┐
│  List page   │    │  Editor page         │    │  Grail                    │
│  (DataTable) │    │  toolbar · palette   │    │                           │
│              │    │  React Flow canvas   │───▶│  DQL: entities, problems, │
│              │    │  config / detail     │    │       KPIs (query API)    │
└──────┬───────┘    └─────────┬────────────┘    │  SLO evaluation API       │
       │                      │                 │  Resource Store (lookup)  │
       └──────── lookupStore ─┴────────────────▶│                           │
                                                └───────────────────────────┘
```

| Layer | Files | Responsibility |
|---|---|---|
| Model | `ui/app/model/schema.ts`, `types.ts`, `defaults.ts` | zod schema (single source of truth), runtime status types, factories and the sample diagram |
| Services | `ui/app/services/*` | DQL execution and validators, problem query builder, status engine, SLO client, lookup store, icon registry, time expressions |
| Hooks | `ui/app/hooks/*` | Live status cycle, auto-refresh, undo/redo |
| Canvas | `ui/app/canvas/*` | React Flow wrapper, node and edge components, status colors |
| Panels / toolbar / pages | `ui/app/panels`, `toolbar`, `pages` | Forms, detail panel, editor toolbar, palette, list and editor pages |

The schema is converted to and from React Flow nodes and edges in `canvas/flowTypes.ts`. Node and edge components
read the computed status from a React context (`DiagramContext`) instead of their `data`, so a status refresh never
rewrites the diagram itself.

## Running DQL

`services/dql.ts` wraps `@dynatrace-sdk/client-query`:

1. `queryExecute` with `defaultTimeframeStart/End` (ISO 8601), the user's time zone, a 30 s request timeout and
   `maxResultRecords`.
2. `queryPoll` until `SUCCEEDED`, or an error on `FAILED`, `CANCELLED` or `RESULT_GONE`.
3. The result is normalized to `{ records, columns, types }`. Column types come from the Grail type buckets: `long`
   values arrive as strings, so numeric detection relies on the types, not on `typeof`.

Validators used by the forms and the status engine:

| Validator | Used for | Rule |
|---|---|---|
| `assertColumns(result, ["id"])` | Entity component | must return `id` (a warning is shown if `name` is missing) |
| `assertColumns(result, ["id", "name"])` | Container in entities mode | both columns are mandatory |
| `assertSingleValue(result, valueField?)` | KPI connection | first row; `valueField` or the first numeric column; arrays use the last numeric value |
| `assertTable(result)` | KPI block | at least one column |

Grail error messages (`details.errorMessage`, missing scopes) are shown inline under each DQL editor.

### Timeframe

The `TimeframeSelector` keeps expressions such as `now()-2h`. The query API only accepts ISO timestamps, so
`services/time.ts` resolves the expressions at the start of every refresh cycle (offsets in s/m/h/d/w/M/q/y and `@`
alignment such as `now()-1d@d`). Relative timeframes therefore move forward with auto-refresh.

## Problem queries

`services/queryBuilder.ts` builds one query per node (or per container), with the timeframe and ids already inlined
so the detail panel can show the exact query that ran:

```dql
fetch dt.davis.problems, from: "<from>", to: "<to>"
| filter not(dt.davis.is_duplicate)
| dedup event.id, sort: {timestamp desc}
| filter event.status == "ACTIVE"                       // traffic light only; the detail query omits it
| filter iAny(in(affected_entity_ids[], array(<ids>)))
      or iAny(in(toString(smartscape.affected_entity.ids[]), array(<ids>)))
| filter <problemMatch>                                 // optional fail-point filter
| fields event.id, event.kind, display_id, event.name, event.status, event.category,
         event.start, event.end, affected_entity_ids, smartscape.affected_entity.ids,
         root_cause_entity_id, root_cause_entity_name
| sort event.start desc
| limit 1000
```

- `dedup` keeps the latest record of each problem inside the timeframe, so a problem that closed before `to` is
  not counted as active.
- Matching both id arrays makes classic ids (`SERVICE-…`, from `fetch dt.entity.*`) and Smartscape ids (from
  `smartscapeNodes`) work. If the entity query returns `id_classic` (Smartscape frontends do), it is matched too.
- Containers run a single problem query for all their ids and group the problems per child in memory.

## Status engine

`services/statusEngine.ts` and `hooks/useDiagramStatus.ts`:

- **Triggers**: load, timeframe change, manual refresh, auto-refresh tick, and saving the configuration of one
  element (that element only).
- **Cache**: during a cycle, results are cached by `timeframe + DQL`, so identical queries run once.
- **Concurrency**: at most 4 queries in flight (a small built-in limiter, equivalent to `p-limit`).
- **Cancellation**: a full refresh aborts the previous cycle through `AbortController`.
- **Progressive rendering**: each node and edge is painted as soon as its own queries finish; elements keep their
  previous color while refreshing and only show "loading" when they have no previous status.
- **Statuses**: `pass | warning | failing | unknown | loading`.

Threshold evaluation for KPI connections:

```ts
function evalThreshold(v: number, t: Threshold): "pass" | "warning" | "failing" {
  const bad = (lim: number | null) => lim !== null && (t.direction === "above" ? v > lim : v < lim);
  if (bad(t.failing)) return "failing";
  if (bad(t.warning)) return "warning";
  return "pass";
}
```

SLO containers call `startSloEvaluation` / `pollSloEvaluation` from `@dynatrace-sdk/client-service-level-objectives`
and map `SUCCESS/WARNING/FAILURE/ERROR` to `pass/warning/failing/unknown`. Each SLO is evaluated with its own
timeframe.

## Auto-refresh

`hooks/useAutoRefresh.ts` runs the refresh every 30 s to 30 min (off by default), skips ticks while the browser tab is
hidden (`document.visibilityState`) and refreshes when the tab becomes visible again if the interval has elapsed.

## Persistence

`services/lookupStore.ts` stores diagrams in the Grail lookup `/lookups/custom-diagram-creator/diagrams` through
`lookupDataClient` from `@dynatrace-sdk/client-resource-store`.

- **Read**: `load "<path>"` queries; the list never loads the `payload` column.
- **Write**: a lookup is replaced as a whole. Save = load all rows → upsert one → upload JSONL with
  `overwrite: true`, `lookupField: "id"`.
- **Parse pattern**: the columns are typed explicitly. With a plain `JSON:json` pattern Grail converts ISO date
  strings into timestamps (returned with nanoseconds) and would also alter any name that looks like a date:

  ```
  JSON{STRING:id, STRING:name, STRING:description, STRING:owner, STRING:createdAt,
       STRING:updatedAt, BOOLEAN:deleted, STRING:payload}:row
  ```

- **Payload**: the diagram JSON, UTF-8, base64 (no escaping issues with commas, quotes or line breaks).
- **Concurrency**: the editor keeps the `updatedAt` it loaded. Before saving, the store reads the table again; if
  `updatedAt` changed, a dialog offers **Overwrite** or **Reload**. Timestamps are compared as instants, so tables
  written by other tools (with nanosecond precision) don't cause false conflicts.
- **Empty table**: deleting the last diagram keeps one row with `deleted: true` instead of uploading an empty file.
  Such rows are dropped on the next save.
- **Bootstrap**: when the list opens, `load "<path>" | limit 1` failing with `UNKNOWN_TABULAR_FILE` creates the table
  with the sample diagram (filled with up to three real SLOs if the environment has any) and shows a toast.
- **Limits**: 100 MB per lookup file; the app refuses to upload above it and warns when one diagram exceeds 5 MB.
- **Administration**: the ⚙ dialog lists the app's files from `fetch dt.system.files` and can delete one.

## Navigation

- Problem links use the `view-problem` intent of `dynatrace.davis.problems` with `event.id` and `event.kind`
  (`getIntentLink`), falling back to a deep link.
- "Open in Notebook" uses the `view-query` intent of `dynatrace.notebooks` with `dt.query` and `dt.timeframe`.

## UI conventions

- Strato components imported from their sub-packages (lint rule), Strato design tokens for every color: no hex values.
- Light/dark theme follows Strato (`useCurrentTheme` drives React Flow's `colorMode`).
- Every status has an icon and a tooltip besides its color; KPI animations respect `prefers-reduced-motion`.
- The canvas uses `ConnectionMode.Loose` with one handle per side (`t`, `r`, `b`, `l`); the arrow direction is a
  property of the edge (`forward`, `backward`, `none`).

## Editing model (dashboard-style)

- **Chrome** (`canvas/nodes/NodeChrome.tsx`, `canvas/edges/EdgeChrome.tsx`): in edit mode, a selected node shows a
  React Flow `NodeToolbar` (size badge, duplicate, edit, ⋮ with details/delete) and two `NodeResizeControl` grips in
  the bottom corners; a selected connection shows an `EdgeToolbar` (edit, delete).
- **Docked panel** (`panels/SidePanel.tsx`): the node, connection and detail panels sit to the right of the canvas
  instead of covering it. The node and connection editors use Strato `Tabs` and `Accordion` sections.
- **Live apply**: the editors keep a local draft, validate it with zod on every change and push valid data to the
  canvas immediately. Each change carries a commit mode: `none` (canvas only), `debounced` (status refresh after
  900 ms, for thresholds and filters) or `now` (Run). Pending changes are refreshed when the panel closes or
  switches to another element.
- **Undo**: the first change of a panel session records one history snapshot; undo/redo remounts the open panel with
  the restored data.

## Decisions verified against a live environment

| Topic | Decision |
|---|---|
| Entities | `smartscapeNodes` templates; `fetch dt.entity.service` returned `UNKNOWN_DATA_OBJECT` in a new environment |
| SLO SDK | `@dynatrace-sdk/client-service-level-objectives` (there is no `client-slo` package) |
| Icons | only real exports of `@dynatrace/strato-icons`, e.g. `ApplicationsIcon`, `HostsIcon` (no `ApplicationIcon`, `HostIcon`) |
| Side panels | Strato `Sheet` (`Drawer` is only exported as internal `_Drawer`) |
| JSON Schema | zod 4's built-in `z.toJSONSchema` (`zod-to-json-schema` doesn't support zod 4) |
| Lookup pattern | explicitly typed DPL (see above) |
