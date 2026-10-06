#!/usr/bin/env bash
# Shown when you open the codespace: where the app will be deployed and how.
url="${DT_APP_ENVIRONMENT_URL:-}"
if [ -n "${DT_APP_PLATFORM_TOKEN:-}" ]; then token="set"; else token="not set"; fi
cat <<EOF

  Custom Diagram Creator — ready to deploy

    Environment URL : ${url:-not set}
    Platform token  : ${token}

  Deploy with:  npm run deploy:token
  It asks for the environment URL and the token (Enter keeps the values above),
  so you can deploy to any environment without changing your Codespaces secrets.

EOF
