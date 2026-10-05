# Custom Diagram Creator

**Architecture diagrams for Dynatrace that show what's broken, live.**

Draw your system by hand — frontends, services, hosts, databases, SLOs — and the diagram lights up with live status
from Dynatrace: components turn green, orange or red from active Davis problems, containers sum up their entities or
SLOs, and connections show KPI values with animated flow.

📖 **Documentation: <https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/>**

## What you get

- A canvas to draw and connect components, with Dashboards-style editing.
- Pick the real entities behind each component from a searchable list; live status from Davis problems and SLOs.
- Containers built from your own DQL queries or a set of SLOs.
- As many KPIs as you need under any component, and KPI values on the connections, with ready-made or custom units.
- Diagrams stored in Grail, managed like dashboards: list, duplicate, upload, download, delete.
- A skill so an AI agent with `dtctl` can build diagrams from real entities.

## Quick start

You need Node.js 20.19+ and a Dynatrace environment where you can install apps.

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

The first time the app opens it creates its storage with a sample diagram.

## Learn more

| Page | What's in it |
|---|---|
| [Getting started](https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/getting-started.html) | Install, deploy, permissions, troubleshooting |
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
