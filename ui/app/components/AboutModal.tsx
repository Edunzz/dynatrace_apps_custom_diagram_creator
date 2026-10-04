import React from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Modal } from "@dynatrace/strato-components/overlays";
import { ExternalLink } from "@dynatrace/strato-components/typography";
import { AUTHOR, DOCS_URL, REPO_URL, appVersion } from "../about";

const rowLabel = { width: 120, flexShrink: 0, color: Colors.Text.Neutral.Subdued } as const;

/** "About" dialog opened from the info button on the diagram list. */
export function AboutModal({ show, onClose }: { show: boolean; onClose: () => void }) {
  const version = appVersion();
  return (
    <Modal title="About Custom Diagram Creator" show={show} onDismiss={onClose} size="small">
      <Flex flexDirection="column" gap={12}>
        <span>
          Draw architecture diagrams by hand and light them up with live status from Grail: Davis problems, SLOs and DQL
          KPIs.
        </span>
        <Flex flexDirection="column" gap={8}>
          {version && (
            <Flex gap={8}>
              <span style={rowLabel}>Version</span>
              <span>{version}</span>
            </Flex>
          )}
          <Flex gap={8}>
            <span style={rowLabel}>Author</span>
            <span>{AUTHOR}</span>
          </Flex>
          <Flex gap={8}>
            <span style={rowLabel}>Source code</span>
            <ExternalLink href={REPO_URL}>github.com/Edunzz/dynatrace_apps_custom_diagram_creator</ExternalLink>
          </Flex>
          <Flex gap={8}>
            <span style={rowLabel}>Documentation</span>
            <ExternalLink href={DOCS_URL}>edunzz.github.io/dynatrace_apps_custom_diagram_creator</ExternalLink>
          </Flex>
        </Flex>
      </Flex>
    </Modal>
  );
}
