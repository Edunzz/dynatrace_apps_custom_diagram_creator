import React, { useMemo, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Modal } from "@dynatrace/strato-components/overlays";
import { TextInput, ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import type { ComponentType } from "../model/schema";
import { ICON_GROUPS, ICON_NAMES, RELEVANT_GROUPS, iconsForGroup, resolveIcon } from "../services/icons";

export interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  /** Component type: drives the «Relevantes» filter. "custom" = no filter. */
  componentType: ComponentType | "custom";
}

export function IconPicker({ value, onChange, componentType }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const relevantGroups = RELEVANT_GROUPS[componentType];
  const [group, setGroup] = useState<string>(relevantGroups.length ? "relevant" : "all");
  const [search, setSearch] = useState("");
  const Current = resolveIcon(value);

  const names = useMemo(() => {
    let list: string[];
    if (group === "all") {
      list = ICON_NAMES;
    } else if (group === "relevant") {
      list = Array.from(new Set(relevantGroups.flatMap(iconsForGroup))).sort((a, b) => a.localeCompare(b));
    } else {
      list = iconsForGroup(group);
    }
    const q = search.trim().toLowerCase();
    return q ? list.filter((n) => n.toLowerCase().includes(q)) : list;
  }, [group, search, relevantGroups]);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Button.Prefix>
          <Current />
        </Button.Prefix>
        {value}
      </Button>
      <Modal title="Elegir icono" show={open} onDismiss={() => setOpen(false)} size="large">
        <Flex flexDirection="column" gap={12}>
          <TextInput value={search} onChange={(v) => setSearch(v)} placeholder="Buscar icono…" />
          <ToggleButtonGroup value={group} onChange={(v) => setGroup(v)}>
            {relevantGroups.length > 0 && <ToggleButtonGroup.Item value="relevant">Relevantes</ToggleButtonGroup.Item>}
            <ToggleButtonGroup.Item value="all">Todos ({ICON_NAMES.length})</ToggleButtonGroup.Item>
            {ICON_GROUPS.map((g) => (
              <ToggleButtonGroup.Item key={g.id} value={g.id}>
                {g.label}
              </ToggleButtonGroup.Item>
            ))}
          </ToggleButtonGroup>
          <div className="cdc-icon-grid">
            {names.map((name) => {
              const Icon = resolveIcon(name);
              return (
                <button
                  type="button"
                  key={name}
                  className={`cdc-icon-cell${name === value ? " cdc-active" : ""}`}
                  title={name}
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                >
                  <Icon size="large" />
                  <span>{name.replace(/Icon$/, "")}</span>
                </button>
              );
            })}
            {names.length === 0 && <span>Sin resultados</span>}
          </div>
        </Flex>
      </Modal>
    </>
  );
}
