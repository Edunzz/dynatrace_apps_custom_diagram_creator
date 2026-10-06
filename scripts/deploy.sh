#!/usr/bin/env bash
# Builds and deploys the app with a platform token, without a browser sign-in
# (GitHub Codespaces, CI or any Linux/macOS shell).
#
#   DT_APP_ENVIRONMENT_URL  https://<environment-id>.apps.dynatrace.com (takes precedence over app.config.json)
#   DT_APP_PLATFORM_TOKEN   platform token with app-engine:apps:install, app-engine:apps:run, app-engine:apps:delete
#
# Values come from Codespaces secrets, `export`, or a .env file in the project root. In a terminal the script asks
# for the environment URL and the token, showing the current ones (Enter keeps them), so you can deploy to any
# environment without changing your secrets. `--yes` skips the questions (CI).
# Other arguments are passed to `dt-app deploy` (e.g. --dry-run).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

ask=true
args=()
for arg in "$@"; do
  case "$arg" in
    -y | --yes) ask=false ;;
    *) args+=("$arg") ;;
  esac
done
[ -t 0 ] || ask=false

url="${DT_APP_ENVIRONMENT_URL:-}"
token="${DT_APP_PLATFORM_TOKEN:-}"

if $ask; then
  echo "Deploy Custom Diagram Creator — press Enter to keep the value in brackets."
  read -r -p "Environment URL [${url:-not set}]: " answer
  if [ -n "$answer" ] && [ "$answer" != "$url" ]; then
    url="$answer"
    token="" # a token belongs to its environment
  fi
  if [ -n "$token" ]; then
    read -r -s -p "Platform token [keep the current one]: " answer
  else
    read -r -s -p "Platform token: " answer
  fi
  echo
  [ -z "$answer" ] || token="$answer"
fi

missing=()
[ -n "$url" ] || missing+=("DT_APP_ENVIRONMENT_URL")
[ -n "$token" ] || missing+=("DT_APP_PLATFORM_TOKEN")
if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing: ${missing[*]}" >&2
  echo "Run npm run deploy:token in a terminal and type them, set them as Codespaces secrets, export them, or copy .env.example to .env." >&2
  exit 1
fi

if [[ ! "$url" =~ ^https://[^/]+\.apps\. ]]; then
  echo "The environment URL must be the platform URL, like https://<environment-id>.apps.dynatrace.com" >&2
  echo "Got: $url" >&2
  exit 1
fi
export DT_APP_ENVIRONMENT_URL="$url" DT_APP_PLATFORM_TOKEN="$token"

if [ ! -d node_modules ]; then
  npm ci
fi

app_id=$(node -p "require('./app.config.json').app.id")
app_version=$(node -p "require('./app.config.json').app.version")
echo "Deploying ${app_id} ${app_version} to ${DT_APP_ENVIRONMENT_URL}"

npx dt-app deploy --environment-url "$DT_APP_ENVIRONMENT_URL" ${args[@]+"${args[@]}"}

echo "Open it at ${DT_APP_ENVIRONMENT_URL%/}/ui/apps/${app_id}"
