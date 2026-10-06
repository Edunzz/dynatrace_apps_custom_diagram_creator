# Custom Diagram Creator

[English](README.md) · **Español**

**Diagramas de arquitectura para Dynatrace que muestran en vivo qué está fallando.**

Dibuja tu sistema a mano — frontends, servicios, hosts, bases de datos, SLOs — y el diagrama se ilumina con el estado
en vivo de Dynatrace: los componentes se ponen verdes, naranjas o rojos según los problemas activos de Davis, los
contenedores resumen sus entidades o SLOs, y las conexiones muestran valores de KPIs con flujo animado.

📖 **Documentación (en inglés): <https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/>**

## Qué incluye

- Un lienzo para dibujar y conectar componentes, con edición al estilo de los Dashboards.
- 49 tipos de componente de entidad (aplicaciones, endpoints, monitores sintéticos, hosts, Kubernetes, bases de datos,
  AWS, Azure, Google Cloud): eliges las entidades reales en una lista con búsqueda y obtienes su estado en vivo a
  partir de los problemas de Davis y los SLOs.
- KPIs prediseñados para cada tipo de componente — request count, response time y failure rate para servicios y
  endpoints, availability para hosts, procesos y monitores sintéticos, y más — con una línea por cada entidad que
  elijas. También puedes escribir tus propios KPIs con DQL.
- Contenedores armados con tus propias queries DQL o con un conjunto de SLOs.
- Valores de KPIs en las conexiones, con unidades predefinidas o personalizadas.
- Diagramas guardados en Grail y administrados como los dashboards: listar, duplicar, subir, descargar y eliminar.
- Un skill para que un agente de IA con `dtctl` construya diagramas a partir de entidades reales.

## Desplegarla en tu entorno

Necesitas un entorno Dynatrace SaaS en el que puedas instalar apps. Elige una de las dos opciones.

### Opción A — GitHub Codespaces (sin instalar nada)

[![Abrir en GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Edunzz/dynatrace_apps_custom_diagram_creator)

El codespace ya trae Node.js y todas las dependencias instaladas. Solo tienes que dar dos valores: la URL de tu
entorno y un platform token.

1. **Crea un platform token.** Entra a [My platform tokens](https://myaccount.dynatrace.com/platformTokens), elige
   **Platform token**, ponle un nombre y una fecha de expiración, selecciona tu entorno y agrega estos scopes:
   - `app-engine:apps:install`
   - `app-engine:apps:run`
   - `app-engine:apps:delete`

   Pulsa **Generate** y copia el token: solo se muestra una vez. El token funciona dentro de tus propios permisos,
   así que tu usuario debe poder instalar apps en ese entorno.
2. **Crea el codespace.** Haz clic en el botón de arriba (o en **Code › Codespaces › Create codespace on main**). La
   primera vez, la página de creación pide dos secretos recomendados:

   | Secreto | Valor |
   |---|---|
   | `DT_APP_ENVIRONMENT_URL` | `https://<id-del-entorno>.apps.dynatrace.com` |
   | `DT_APP_PLATFORM_TOKEN` | el token del paso 1 |

   GitHub los guarda como tus secretos de Codespaces para este repositorio. Desde entonces la página de creación solo
   los muestra como *Associated with repository* y los reutiliza; el siguiente paso te deja usar otros valores igual.
3. **Espera a que termine la preparación** (`npm ci` se ejecuta solo). La terminal muestra dónde se va a desplegar la
   app.
4. **Despliega** desde la terminal del codespace:

   ```bash
   npm run deploy:token
   ```

   Te pide la **URL del entorno** y el **platform token**, mostrando los valores guardados: pulsa Enter para usarlos o
   escribe la URL y el token de otro entorno para desplegar ahí (no se guarda nada). Luego compila la app, la instala
   y muestra el enlace: `https://<id-del-entorno>.apps.dynatrace.com/ui/apps/my.custom.diagram.creator`.

**Desplegar en otro entorno.** Ejecuta `npm run deploy:token` y escribe la nueva URL y el token. Si quieres que la
página de creación vuelva a pedir los valores, borra los dos secretos (o quita este repositorio de ellos) en
[GitHub › Settings › Codespaces](https://github.com/settings/codespaces); si los cambias ahí, aplican a los codespaces
nuevos y a los que ya corren después de reiniciarlos. Sin secretos también puedes copiar `.env.example` a `.env` (git lo
ignora), y en CI `npm run deploy:token -- --yes` usa las variables de entorno sin preguntar.

### Opción B — Tu máquina

Necesitas Node.js 20.19 o superior.

```bash
git clone https://github.com/Edunzz/dynatrace_apps_custom_diagram_creator.git
cd dynatrace_apps_custom_diagram_creator
npm install
```

Pon tu entorno en `app.config.json` (`"environmentUrl": "https://<id-de-tu-entorno>.apps.dynatrace.com/"`) y
despliega:

```bash
npm run deploy
```

El primer deploy abre el navegador para iniciar sesión con SSO. `npm run deploy:token` también funciona en tu máquina
(Linux, macOS o Git Bash) si prefieres usar un platform token.

### Después del deploy

La primera vez que se abre, la app crea su almacenamiento con tres diagramas de ejemplo: *Online Banking*,
*Platform signals* y *EasyTrade trading platform*.

Para desplegar una versión nueva en el mismo entorno, primero sube `version` en `app.config.json` y en
`package.json`: el entorno rechaza una versión que ya tiene instalada.

## Más información

La documentación completa está en inglés:

| Página | Contenido |
|---|---|
| [Getting started](https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/getting-started.html) | Instalación, deploy (local o Codespaces), permisos, solución de problemas |
| [User guide](https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/user-guide.html) | Componentes, contenedores, KPIs, conexiones, edición |
| [Architecture](https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/architecture.html) | Queries, motor de estado, almacenamiento |
| [Data model](https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/data-model.html) | El formato JSON de los diagramas |
| [Agent skill](https://edunzz.github.io/dynatrace_apps_custom_diagram_creator/agent-skill.html) | Generar diagramas con un agente de IA y `dtctl` |

## Desarrollo

```bash
npm run start   # servidor de desarrollo
npm test        # pruebas unitarias
npm run lint    # ESLint
```

El sitio de documentación es HTML plano en [`docs/`](docs/), publicado con GitHub Pages.

## Aviso

Este es un proyecto comunitario, no un producto oficial de Dynatrace, y Dynatrace no le da soporte. El único soporte es
el que ofrece el autor a través de los [issues](https://github.com/Edunzz/dynatrace_apps_custom_diagram_creator/issues)
de este repositorio. Úsalo bajo tu propio riesgo.

## Autor

Hecho por **Jose Eduardo Romero Jimenez**.
