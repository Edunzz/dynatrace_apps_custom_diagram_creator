#!/usr/bin/env bash
# Builds and deploys the app with a platform token, without a browser sign-in
# (GitHub Codespaces, CI or any Linux/macOS shell).
#
#   DT_APP_ENVIRONMENT_URL  https://<environment-id>.apps.dynatrace.com (takes precedence over app.config.json)
#   DT_APP_PLATFORM_TOKEN   platform token with app-engine:apps:install, app-engine:apps:run, app-engine:apps:delete
#
# Both can come from Codespaces secrets, from `export`, or from a .env file in the project root.
# Extra arguments are passed to `dt-app deploy` (e.g. --dry-run).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

missing=()
[ -n "${DT_APP_ENVIRONMENT_URL:-}" ] || missing+=("DT_APP_ENVIRONMENT_URL")
[ -n "${DT_APP_PLATFORM_TOKEN:-}" ] || missing+=("DT_APP_PLATFORM_TOKEN")
if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing: ${missing[*]}" >&2
  echo "Set them as Codespaces secrets, export them in this terminal, or copy .env.example to .env and fill it in." >&2
  exit 1
fi

if [[ ! "$DT_APP_ENVIRONMENT_URL" =~ ^https://[^/]+\.apps\. ]]; then
  echo "DT_APP_ENVIRONMENT_URL must be the platform URL, like https://<environment-id>.apps.dynatrace.com" >&2
  echo "Got: $DT_APP_ENVIRONMENT_URL" >&2
  exit 1
fi
export DT_APP_ENVIRONMENT_URL DT_APP_PLATFORM_TOKEN

if [ ! -d node_modules ]; then
  npm ci
fi

app_id=$(node -p "require('./app.config.json').app.id")
app_version=$(node -p "require('./app.config.json').app.version")
echo "Deploying ${app_id} ${app_version} to ${DT_APP_ENVIRONMENT_URL}"

npx dt-app deploy --environment-url "$DT_APP_ENVIRONMENT_URL" "$@"

echo "Open it at ${DT_APP_ENVIRONMENT_URL%/}/ui/apps/${app_id}"
