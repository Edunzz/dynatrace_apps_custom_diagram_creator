import { queryAssistanceClient } from "@dynatrace-sdk/client-query";
import { StateEffect } from "@codemirror/state";
import { Decoration, EditorView, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { PLACEHOLDER_PATTERN, maskPlaceholders } from "./kpiScope";

/**
 * The Strato DQL editor validates every query with the query-assistance API, which doesn't know KPI placeholders
 * such as `$entityIds`, and has no props for variables. These helpers teach it about them:
 * - validation and autocomplete see each placeholder as a string literal of the same length (`$entityIds` →
 *   `"entityId"`), so the query is valid and the positions of any other error stay right;
 * - the editor paints the placeholders in the primary color.
 */
let validationPatched = false;

/** Wraps the validation and autocomplete calls the DQL editor makes (once per page). */
export function teachValidationAboutPlaceholders(): void {
  if (validationPatched) {
    return;
  }
  validationPatched = true;
  const client = queryAssistanceClient;
  const verify = client.queryVerify.bind(client);
  client.queryVerify = (config) => verify({ ...config, body: { ...config.body, query: maskPlaceholders(config.body.query) } });
  const autocomplete = client.queryAutocomplete.bind(client);
  client.queryAutocomplete = (config) =>
    autocomplete({ ...config, body: { ...config.body, query: maskPlaceholders(config.body.query) } });
}

const placeholderMark = Decoration.mark({
  class: "cdc-dql-placeholder",
  attributes: { title: "Replaced with the entities picked on the Data tab" },
});

const placeholderMatcher = new MatchDecorator({ regexp: new RegExp(PLACEHOLDER_PATTERN, "g"), decoration: placeholderMark });

const placeholderHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = placeholderMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = placeholderMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const highlighted = new WeakSet<EditorView>();

/** Adds the placeholder highlight to the CodeMirror editor rendered inside `container` (once per editor). */
export function highlightPlaceholders(container: HTMLElement | null): void {
  const dom = container?.querySelector<HTMLElement>(".cm-editor");
  const view = dom ? EditorView.findFromDOM(dom) : null;
  if (!view || highlighted.has(view)) {
    return;
  }
  try {
    view.dispatch({ effects: StateEffect.appendConfig.of(placeholderHighlight) });
    highlighted.add(view);
  } catch {
    // Highlighting is a nicety: an editor that refuses the extension still works.
  }
}
