import React, { useEffect, useState } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Select } from "@dynatrace/strato-components/forms";
import { XmarkIcon } from "@dynatrace/strato-icons";
import type { ComponentType, EntityRef } from "../model/schema";
import { COMPONENT_LABELS } from "../model/defaults";
import { errorMessage } from "../services/dql";
import { listEntities, type EntityOption } from "../services/entities";
import { InlineMessage } from "./Field";

const TYPE_LABELS: Record<string, string> = {
  K8S_DEPLOYMENT: "Deployment",
  K8S_STATEFULSET: "StatefulSet",
  K8S_DAEMONSET: "DaemonSet",
};

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

  useEffect(() => {
    const controller = new AbortController();
    setOptions(null);
    setError(null);
    listEntities(componentType, controller.signal)
      .then(setOptions)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(e));
          setOptions([]);
        }
      });
    return () => controller.abort();
  }, [componentType]);

  // Picked entities that are no longer listed (deleted, older than 7 days) stay visible so they can be removed.
  const all: EntityOption[] = [...(options ?? []), ...value.filter((v) => !(options ?? []).some((o) => o.id === v.id))];
  const byId = new Map(all.map((o) => [o.id, o]));
  const typeLabel = COMPONENT_LABELS[componentType].toLowerCase();

  return (
    <Flex flexDirection="column" gap={8}>
      {error && <InlineMessage kind="error">{error}</InlineMessage>}
      <Select
        multiple
        value={value.map((e) => e.id)}
        onChange={(ids) =>
          onChange(
            (ids ?? []).map((id) => {
              const o = byId.get(id);
              const ref: EntityRef = { id, name: o?.name ?? id };
              if (o?.classicId) {
                ref.classicId = o.classicId;
              }
              return ref;
            }),
          )
        }
        aria-label={`${COMPONENT_LABELS[componentType]} entities`}
      >
        <Select.Filter />
        <Select.Content loading={options === null} showSelectedOptionsFirst>
          {all.map((o) => (
            <Select.Option key={o.id} value={o.id} textValue={`${o.name} ${o.id}`}>
              {o.name}
              {o.type ? ` · ${TYPE_LABELS[o.type] ?? o.type}` : ""}
            </Select.Option>
          ))}
        </Select.Content>
        <Select.EmptyState>No {typeLabel} entities were seen in the last 7 days.</Select.EmptyState>
      </Select>
      {value.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {value.map((e) => (
            <div
              key={e.id}
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
                onClick={() => onChange(value.filter((v) => v.id !== e.id))}
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
