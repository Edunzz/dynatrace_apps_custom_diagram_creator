import React from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { ExternalLink } from "@dynatrace/strato-components/typography";
import { AUTHOR, REPO_URL, appVersion } from "../about";

/** Small, unobtrusive footer with the author, the source repository and a no-support note. */
export function AppFooter() {
  const version = appVersion();
  return (
    <footer
      style={{
        flexShrink: 0,
        display: "flex",
        justifyContent: "center",
        gap: 6,
        padding: "4px 16px",
        fontSize: 11,
        color: Colors.Text.Neutral.Subdued,
        borderTop: `1px solid ${Colors.Border.Neutral.Subdued}`,
      }}
    >
      <span>
        Custom Diagram Creator{version ? ` v${version}` : ""} · Built by {AUTHOR} ·
      </span>
      <ExternalLink href={REPO_URL}>GitHub</ExternalLink>
      <span>· Community app, not supported by Dynatrace</span>
    </footer>
  );
}
