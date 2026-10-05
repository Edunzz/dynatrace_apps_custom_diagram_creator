import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Select, TextInput } from "@dynatrace/strato-components/forms";
import { UNIT_PRESETS, isPresetUnit } from "../services/units";
import { Field } from "./Field";

const CUSTOM = "__custom__";
const NONE = "__none__";

/** Unit picker: common units plus "Custom…", which shows a text input for any unit. */
export function UnitField({ value, onChange, label = "Unit" }: { value: string | undefined; onChange: (unit: string | undefined) => void; label?: string }) {
  const [custom, setCustom] = useState(() => !isPresetUnit(value));
  const selected = custom ? CUSTOM : value ? value : NONE;
  return (
    <Field label={label}>
      <Flex flexDirection="column" gap={6}>
        <Select
          value={selected}
          onChange={(v) => {
            if (v === CUSTOM) {
              setCustom(true);
              return;
            }
            setCustom(false);
            onChange(!v || v === NONE ? undefined : v);
          }}
        >
          <Select.Content>
            {UNIT_PRESETS.map((u) => (
              <Select.Option key={u.value || NONE} value={u.value || NONE}>
                {u.label}
              </Select.Option>
            ))}
            <Select.Option value={CUSTOM}>Custom…</Select.Option>
          </Select.Content>
        </Select>
        {custom && (
          <TextInput
            value={value ?? ""}
            onChange={(v) => onChange(v.trim() ? v : undefined)}
            placeholder="e.g. orders/min, tx, °C"
            aria-label="Custom unit"
          />
        )}
      </Flex>
    </Field>
  );
}
