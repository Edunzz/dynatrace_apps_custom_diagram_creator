# Custom Diagram Creator

**English** · [Español](README.es.md)

**Architecture diagrams for Dynatrace that show what's broken, live.**

Draw your system by hand — frontends, services, hosts, databases, SLOs — and the diagram lights up with live status
from Dynatrace: components turn green, orange or red from active Davis problems, containers sum up their entities or
SLOs, and connections show KPI values with animated flow.

📖 **Documentation: <https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/>**

## What you get

- A canvas to draw and connect components, with Dashboards-style editing.
- 45 entity component types (apps, hosts, Kubernetes, databases, AWS, Azure, Google Cloud): pick the real entities
  from a searchable list and get live status from Davis problems and SLOs.
- Containers built from your own DQL queries or a set of SLOs.
- As many KPIs as you need under any component, and KPI values on the connections, with ready-made or custom units.
- Diagrams stored in Grail, managed like dashboards: list, duplicate, upload, download, delete.
- A skill so an AI agent with `dtctl` can build diagrams from real entities.

## Deploy it to your environment

You need a Dynatrace SaaS environment where you are allowed to install apps. Pick one of the two options.

### Option A — GitHub Codespaces (nothing to install)

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Edunzz/dynatrace_apps_custom_diagram_creator)

The codespace comes with Node.js and every dependency installed. You only provide two values: your environment URL
and a platform token.

1. **Create a platform token.** Go to [My platform tokens](https://myaccount.dynatrace.com/platformTokens), select
   **Platform token**, give it a name and an expiration date, choose your environment and add these scopes:
   - `app-engine:apps:install`
   - `app-engine:apps:run`
   - `app-engine:apps:delete`

   Select **Generate** and copy the token — it is shown only once. The token works within your own permissions, so
   your user must be allowed to install apps in that environment.
2. **Create the codespace.** Click the button above (or **Code › Codespaces › Create codespace on main**). On the
   creation page, fill in the two recommended secrets:

   | Secret | Value |
   |---|---|
   | `DT_APP_ENVIRONMENT_URL` | `https://<environment-id>.apps.dynatrace.com` |
   | `DT_APP_PLATFORM_TOKEN` | the token from step 1 |

   Codespaces saves them as your secrets for this repository and passes them to the codespace as environment
   variables.
3. **Wait for the setup** to finish (`npm ci` runs automatically).
4. **Deploy** from the codespace terminal:

   ```bash
   npm run deploy:token
   ```

   The script checks both variables, builds the app and installs it. At the end it prints the link:
   `https://<environment-id>.apps.dynatrace.com/ui/apps/my.custom.diagram.creator`.

Skipped the secrets, or want to deploy to another environment? Set the values in the codespace instead — either copy
`.env.example` to `.env` and fill it in (`.env` is ignored by git), or export them in the terminal:

```bash
export DT_APP_ENVIRONMENT_URL=https://<environment-id>.apps.dynatrace.com
export DT_APP_PLATFORM_TOKEN=<your-platform-token>
npm run deploy:token
```

Secrets added later in [GitHub › Settings › Codespaces](https://github.com/settings/codespaces) reach a running
codespace only after you restart it.

### Option B — Your machine

You need Node.js 20.19+.

```bash
git clone https://github.com/Edunzz/dynatrace_apps_custom_diagram_creator.git
cd dynatrace_apps_custom_diagram_creator
npm install
```

Set your environment in `app.config.json` (`"environmentUrl": "https://<your-environment-id>.apps.dynatrace.com/"`),
then deploy:

```bash
npm run deploy
```

The first deploy opens the browser to sign in with SSO. `npm run deploy:token` works on your machine too (Linux,
macOS or Git Bash) if you prefer a platform token.

### After the deploy

The first time the app opens it creates its storage with a sample diagram.

To deploy a new version to the same environment, bump `version` in `app.config.json` and `package.json` first — the
environment rejects a version it already has.

## Learn more

| Page | What's in it |
|---|---|
| [Getting started](https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/getting-started.html) | Install, deploy (local or Codespaces), permissions, troubleshooting |
| [User guide](https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/user-guide.html) | Components, containers, KPIs, connections, editing |
| [Architecture](https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/architecture.html) | Queries, status engine, storage |
| [Data model](https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/data-model.html) | The diagram JSON format |
| [Agent skill](https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/agent-skill.html) | Generate diagrams with an AI agent and `dtctl` |

## Development

```bash
npm run start   # dev server
npm test        # unit tests
npm run lint    # ESLint
```

The documentation site is plain HTML in [`docs/`](docs/), published with GitHub Pages.

## Author

Built by **Jose Eduardo Romero Jimenez**.
