# Custom Diagram Creator

**English** · [Español](README.es.md)

**Architecture diagrams for Dynatrace that show what's broken, live.**

Draw your system by hand — frontends, services, hosts, databases, SLOs — and the diagram lights up with live status
from Dynatrace: components turn green, orange or red from active Davis problems, containers sum up their entities or
SLOs, and connections show KPI values with animated flow.

📖 **Documentation: <https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/>**

## What you get

- A canvas to draw and connect components, with Dashboards-style editing.
- 49 entity component types (apps, endpoints, synthetic monitors, hosts, Kubernetes, databases, AWS, Azure, Google
  Cloud): pick the real entities from a searchable list and get live status from Davis problems and SLOs.
- Ready-made KPIs for each component type — request count, response time and failure rate for services and endpoints,
  availability for hosts, processes and synthetic monitors, and more — with one line per entity you pick. Your own DQL
  KPIs work too.
- Containers built from your own DQL queries or a set of SLOs.
- KPI values on the connections, with ready-made or custom units.
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
2. **Create the codespace.** Click the button above (or **Code › Codespaces › Create codespace on main**). The first
   time, the creation page asks for two recommended secrets:

   | Secret | Value |
   |---|---|
   | `DT_APP_ENVIRONMENT_URL` | `https://<environment-id>.apps.dynatrace.com` |
   | `DT_APP_PLATFORM_TOKEN` | the token from step 1 |

   GitHub saves them as your Codespaces secrets for this repository. From then on the creation page only shows them as
   *Associated with repository* and reuses them — the next step lets you use other values anyway.
3. **Wait for the setup** to finish (`npm ci` runs automatically). The terminal shows where the app will be deployed.
4. **Deploy** from the codespace terminal:

   ```bash
   npm run deploy:token
   ```

   It asks for the **environment URL** and the **platform token**, showing your saved values: press Enter to keep
   them, or type another environment's URL and token to deploy there (nothing is saved). Then it builds the app,
   installs it and prints the link: `https://<environment-id>.apps.dynatrace.com/ui/apps/my.custom.diagram.creator`.

**Deploying to another environment.** Run `npm run deploy:token` and type the new URL and token. To have the
creation page ask for the values again, delete the two secrets (or remove this repository from them) in
[GitHub › Settings › Codespaces](https://github.com/settings/codespaces); changing them there applies to new codespaces
and to running ones after a restart. Without secrets you can also copy `.env.example` to `.env` (ignored by git), and
in CI `npm run deploy:token -- --yes` uses the environment variables without asking.

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

The first time the app opens it creates its storage with three sample diagrams: *Online Banking*, *Platform
signals* and *EasyTrade trading platform*.

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

## Disclaimer

This is a community project, not an official Dynatrace product, and Dynatrace doesn't support it. Support comes only
from the author, through this repository's [issues](https://github.com/Edunzz/dynatrace_apps_custom_diagram_creator/issues).
Use it at your own risk.

## Author

Built by **Jose Eduardo Romero Jimenez**.
