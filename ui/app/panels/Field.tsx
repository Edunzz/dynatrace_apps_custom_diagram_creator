import React, { type ReactNode } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { FormField, Label } from "@dynatrace/strato-components/forms";

export function Field({ label, hint, required, children }: { label: string; hint?: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <FormField required={required}>
      <Label>{label}</Label>
      {children}
      {hint && <div style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued, marginTop: 2 }}>{hint}</div>}
    </FormField>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        color: Colors.Text.Neutral.Subdued,
        marginTop: 8,
      }}
    >
      {children}
    </div>
  );
}

export function InlineMessage({ kind, children }: { kind: "error" | "warning" | "info" | "success"; children: ReactNode }) {
  const color =
    kind === "error"
      ? Colors.Text.Critical.Default
      : kind === "warning"
        ? Colors.Text.Warning.Default
        : kind === "success"
          ? Colors.Text.Success.Default
          : Colors.Text.Neutral.Subdued;
  return <div style={{ fontSize: 12, color, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{children}</div>;
}
