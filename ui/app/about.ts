import { getAppVersion } from "@dynatrace-sdk/app-environment";

export const AUTHOR = "Jose Eduardo Romero Jimenez";
export const REPO_URL = "https://github.com/Edunzz/dynatrace_apps_custom_diagram_creator";
export const DOCS_URL = "https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/";
export const ISSUES_URL = `${REPO_URL}/issues`;

export function appVersion(): string | undefined {
  try {
    return getAppVersion();
  } catch {
    return undefined;
  }
}
