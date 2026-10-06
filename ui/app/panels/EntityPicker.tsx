import React, { useEffect, useState } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Select } from "@dynatrace/strato-components/forms";
import { XmarkIcon } from "@dynatrace/strato-icons";
import { COMPONENT_TYPE_DEFS, type ComponentTypeDef } from "../model/componentTypes";
import type { ComponentType, EntityRef } from "../model/schema";
import { COMPONENT_LABELS } from "../model/defaults";
import { errorMessage } from "../services/dql";
import { ENTITY_LIST_LIMIT, entityKey, listEntities, smartscapeTypeLabel, type EntityOption } from "../services/entities";
import { InlineMessage } from "./Field";

const SEARCH_DELAY_MS = 350;

/**
 * Combo box with the entities of one component type (Smartscape, last 7 days).
 * Several entities can be picked; the component reflects the active problems of all of them.
 */
export function EntityPicker({
  componentType,
  value,
  onChange,
}: {
  componentType: ComponentType;
  value: EntityRef[];
  onChange: (entities: EntityRef[]) => void;
}) {
  const [options, setOptions] = useState<EntityOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const def: ComponentTypeDef = COMPONENT_TYPE_DEFS[componentType];
  const endpoints = def.listing === "endpoints";
  const showType = !endpoints && (def.smartscape.length > 1 || def.smartscape[0].endsWith("*"));

  useEffect(() => {
    setFilter("");
    setSearch("");
  }, [componentType]);

  useEffect(() => {
    const controller = new AbortController();
    setOptions(null);
    setError(null);
    listEntities(componentType, controller.signal, search)
      .then(setOptions)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(e));
          setOptions([]);
        }
      });
    return () => controller.abort();
  }, [componentType, search]);

  // Big environments: the first list stops at the limit, so the filter text is also searched on the server.
  const truncated = (options?.length ?? 0) >= ENTITY_LIST_LIMIT;
  useEffect(() => {
    const text = filter.trim();
    if (text === search || (!truncated && !search)) {
      return;
    }
    const timer = setTimeout(() => setSearch(text), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filter, search, truncated]);

  // Picked entities that are no longer listed (deleted, older than 7 days) stay visible so they can be removed.
  const listed = new Set((options ?? []).map(entityKey));
  const all: EntityOption[] = [...(options ?? []), ...value.filter((v) => !listed.has(entityKey(v)))];
  const byKey = new Map(all.map((o) => [entityKey(o), o]));
  const label = COMPONENT_LABELS[componentType];
  const noun = endpoints ? "endpoint" : `${label} entity`;

  return (
    <Flex flexDirection="column" gap={8}>
      {error && <InlineMessage kind="error">{error}</InlineMessage>}
      <Select
        multiple
        value={value.map(entityKey)}
        onChange={(keys) =>
          onChange(
            (keys ?? []).map((key) => {
              const o = byKey.get(key);
              const ref: EntityRef = { id: o?.id ?? key, name: o?.name ?? key };
              if (o?.classicId) {
                ref.classicId = o.classicId;
              }
              if (o?.endpoint) {
                ref.endpoint = o.endpoint;
              }
              return ref;
            }),
          )
        }
        aria-label={`${label} entities`}
      >
        <Select.Filter value={filter} onChange={setFilter} />
        <Select.Content loading={options === null} showSelectedOptionsFirst>
          {all.map((o) => (
            <Select.Option key={entityKey(o)} value={entityKey(o)} textValue={`${o.name} ${o.id}`}>
              {o.name}
              {showType && o.type ? ` · ${smartscapeTypeLabel(o.type)}` : ""}
            </Select.Option>
          ))}
        </Select.Content>
        <Select.EmptyState>
          {search
            ? `No ${noun} matches “${search}”.`
            : endpoints
              ? "No endpoint received requests in the last 7 days."
              : `No ${label} entities were seen in the last 7 days.`}
        </Select.EmptyState>
      </Select>
      {truncated && !search && (
        <span style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>
          Showing the first {ENTITY_LIST_LIMIT.toLocaleString("en-US")} {endpoints ? "by requests" : "by name"}. Type in the list to
          search all of them.
        </span>
      )}
      {value.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {value.map((e) => (
            <div
              key={entityKey(e)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 4px 4px 10px",
                borderRadius: 6,
                background: Colors.Background.Container.Neutral.Default,
                fontSize: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.name}>
                  {e.name}
                </div>
                <div style={{ color: Colors.Text.Neutral.Subdued, fontFamily: "monospace", fontSize: 11 }}>
                  {e.id}
                  {e.classicId ? ` · ${e.classicId}` : ""}
                </div>
              </div>
              <Button
                aria-label={`Remove ${e.name}`}
                size="condensed"
                onClick={() => onChange(value.filter((v) => entityKey(v) !== entityKey(e)))}
              >
                <Button.Prefix>
                  <XmarkIcon />
                </Button.Prefix>
              </Button>
            </div>
          ))}
        </div>
      )}
    </Flex>
  );
}
