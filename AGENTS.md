# AGENTS.md

Guía de trabajo para agentes y colaboradores de Sapin. Define las reglas del proyecto;
el código y la configuración describen su comportamiento real. Si hay discrepancias,
compruébalas y corrige la documentación; no adaptes el código a una descripción obsoleta.

## 1. Contexto

Sapin es una plataforma educativa para cursos con chats, actividades agénticas y
lecciones ramificadas. Incluye RAG, analítica, agentes docentes, memoria persistente,
ficheros y notificaciones. Sus perfiles principales son administración, profesorado y alumnado.

- Aplicación: SvelteKit con adapter-node, Svelte y TypeScript.
- Interfaz: Tailwind, Flowbite Svelte, TipTap y renderizado matemático con KaTeX.
- Datos: SQLite con better-sqlite3 y Drizzle; Qdrant para recuperación vectorial.
- IA: Vercel AI SDK; modelos, cuotas y trazabilidad gestionados por el backend.
- Traducciones: Paraglide, con español como idioma base e inglés como secundario.

Para los contratos entre subsistemas, consulta [Arquitectura](docs/architecture.md).
Las versiones y comandos disponibles se consultan en [package.json](package.json).

## 2. Reglas esenciales

### Permisos, datos y efectos externos

- Cada endpoint debe comprobar sesión, permisos y relación entre los recursos afectados.
  Un layout protegido no sustituye la autorización de un `+server.ts`.
- Reutiliza los helpers de autenticación, roles y BD; los roles de sistema y de curso
  tienen escalas diferentes. No compares sus niveles como si fueran equivalentes.
- Conserva la identidad de cada asignación de rol: `assignmentId` identifica la fila;
  `userId` y `courseId` identifican los recursos. No deduzcas claves de textos visibles.
- No uses la BD habitual, conversaciones reales ni ficheros del usuario como datos de prueba.
  No expongas credenciales en código, documentación, logs o resultados de herramientas.
- Las pruebas con proveedores reales, correo o servicios externos deben estar autorizadas.
  No despliegues ni publiques cambios como consecuencia implícita de una validación local.

### Base de datos

- El esquema está en `src/lib/server/db/schema/`, reexportado desde `index.ts`.
- Tras modificarlo, genera la migración con `npm run db:generate`.
- Conserva el SQL en `drizzle/` y el snapshot correspondiente en `drizzle/meta/`.
- No escribas migraciones a mano salvo instrucción explícita.
- No uses `db:push` como sustituto de una migración versionada ni apliques cambios
  sobre una BD con datos reales sin revisar su alcance.

### Interfaz y contenido

- Usa componentes Svelte en PascalCase y reutiliza los componentes y helpers existentes.
- El HTML dinámico de chats, informes, lecciones y ejercicios pasa por
  `src/lib/components/SafeHtml.svelte`, que sanitiza el resultado final también en SSR.
  No insertes HTML sin limpiar ni añadas excepciones de ESLint para omitir esa protección.
- Mantén la compatibilidad de Markdown, fórmulas y contenido guardado al modificar renderizadores.
- No edites a mano `src/lib/paraglide/`, `.svelte-kit/`, `build/` ni `node_modules/`.
  Modifica sus fuentes o generadores.

### IA y actividades

- Reutiliza la resolución de modelos, las comprobaciones de cuota y el registro de uso.
- Registra los handlers builtin con `defineBuiltinToolPackage`; conserva la validación
  de argumentos, el contexto de permisos y el identificador de llamada.
- Respeta la confirmación humana de herramientas y su pertenencia a la conversación.
  No confundas una respuesta UI simulada con una ejecución real del backend.
- Las sesiones de alumnado se vinculan a una revisión de lección concreta.
  Los previews de borrador y publicación permanecen separados del progreso y la analítica.
- Los documentos RAG importados requieren reindexación; no reutilices la colección de origen.

## 3. Desarrollo y validación

### Preparación

- Instala desde el lockfile con `npm ci`.
- Conserva saltos de línea LF: `.gitattributes` fija el checkout de texto y `.prettierrc`
  fija el formato, independientemente de `core.autocrlf` en cada ordenador.
- Consulta [.env.example](.env.example) y el consumidor de cada variable antes de cambiarla.
  `DATABASE_URL` es obligatoria; el entorno local habitual usa `local.db`.
- Comprueba el estado de Git y los procesos existentes antes de trabajar.
  Respeta los cambios ajenos y no detengas el servidor de desarrollo del usuario.
- Docker es auxiliar: no supongas que reproduce el despliegue de producción.

### Comandos habituales

| Acción                           | Comando                         |
| -------------------------------- | ------------------------------- |
| Desarrollo                       | `npm run dev`                   |
| Pruebas locales (`node:test`)    | `npm test`                      |
| Tipos y Svelte                   | `npm run check`                 |
| Formato y ESLint                 | `npm run lint`                  |
| Compilación de producción        | `npm run build`                 |
| Navegador (Playwright)           | `npm run test:e2e`              |
| Integración con servicios reales | `npm run test:integration:live` |

### Qué ejecutar

- Para cambios de código: `npm test`, `npm run check` y `npm run lint`.
- Añade una compilación cuando afectes al empaquetado, dependencias o configuración.
- Para flujos de interfaz, navegación o integración cliente-servidor, ejecuta las pruebas
  E2E pertinentes; ante cambios transversales, la suite completa. El servidor E2E ya compila.
- Para cambios exclusivamente documentales, revisa formato, enlaces y coherencia con el código;
  no es necesario repetir las pruebas de la aplicación.
- No desactives reglas ni borres pruebas para obtener un resultado limpio.
  Distingue los problemas nuevos de los existentes e informa de las limitaciones.

### Aislamiento de pruebas

- Playwright se configura en `playwright.config.ts`; las pruebas están en `tests/e2e/`.
  Instala Chromium con `npx playwright install chromium` si falta.
- `scripts/e2e-server.mjs` crea una BD ficticia nueva con las migraciones oficiales,
  separa ficheros y credenciales, compila y sirve la aplicación en `127.0.0.1:4187`.
- No ejecutes E2E, un build o tareas que regeneren `.svelte-kit/` simultáneamente con Vite
  u otra compilación en el mismo checkout. Usa una copia aislada si el servidor está activo.
- E2E simula algunas respuestas SSE, respuestas UI y consultas de Qdrant.
  No demuestra por sí solo la generación con IA ni la indexación/recuperación RAG reales.
- La integración live es opt-in, consume tokens y requiere `TEST_QDRANT_URL` local.
  Lee configuración de proveedor/modelo de la BD local y utiliza contenido ficticio;
  crea una colección de prueba que elimina al terminar.
- Informes y trazas quedan en `output/`, ignorado por Git.

## 4. Compatibilidad de dependencias

- Mantén el mínimo Node indicado en `engines` (22.14.0); no lo eleves sin un cambio acordado.
- Conserva TypeScript 5.9.3 y las ramas SvelteKit 2, Vite 7 y AI SDK 6 salvo migración acordada.
- Actualiza todos los paquetes directos `@tiptap/*` conjuntamente y con versiones exactas alineadas.
- Conserva Qdrant JS en `~1.18.0` mientras se use `client.search`; una actualización exige
  revisar y migrar esa API.
- KaTeX permanece en la rama `0.16`, compatible con `marked-katex-extension`.
- `isomorphic-dompurify` está fijado por compatibilidad con el mínimo Node. Revisa también
  los requisitos de DOMPurify y jsdom antes de actualizarlo.
- `package-lock.json` fija la instalación reproducible. Revisa su diff al cambiar dependencias.
- Evalúa los avisos de `npm audit`; no apliques `npm audit fix --force` indiscriminadamente.

## 5. Dónde mirar primero

Las rutas de esta tabla son relativas a la raíz del repositorio.

| Área                         | Puntos de entrada                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Sesión y bootstrap           | `src/hooks.server.ts`, `src/lib/server/auth.ts`, `src/routes/+layout.server.ts`                     |
| Roles y permisos             | `src/lib/server/roles.ts`, `src/lib/server/db/RoleUtils.ts`, `src/lib/server/db/CourseRoleUtils.ts` |
| Esquema y migraciones        | `src/lib/server/db/schema/`, `drizzle/`, `drizzle.config.ts`                                        |
| Modelos, cuotas y RAG        | `src/lib/server/ai/AIUtils.ts`, `src/lib/server/ai/services/`, `src/lib/server/qdrant/`             |
| Agentes, tools y memoria     | `src/lib/server/agent/`, `src/lib/components/agent/`                                                |
| Agentes docentes             | `src/lib/server/insights-agent/`, `src/lib/server/staff-agent/`                                     |
| Lecciones y revisión         | `src/lib/server/lesson/`, `src/lib/components/lesson/`, `src/routes/api/lesson/`                    |
| Analítica y radar            | `src/lib/server/learning-evidence/`, `src/lib/server/radar/`, `src/lib/types/radar.ts`              |
| Ficheros y notificaciones    | `src/lib/server/files/`, `src/lib/server/notifications/`, `src/lib/server/notifier/`                |
| Interfaz y estado compartido | `src/lib/components/`, `src/lib/stores/`, `src/lib/utils/`                                          |
| Traducciones y build         | `messages/`, `project.inlang/`, `vite.config.ts`, `svelte.config.js`                                |

Referencias específicas: [Arquitectura](docs/architecture.md),
[piloto del radar](docs/radar-pilot.md), [enlaces Moodle](docs/moodle-activity-links.md)
y [operación con Docker](docs/docker-production.md).
El [plan agéntico](docs/agent-upgrade-plan.md) es una referencia de diseño histórica;
comprueba su correspondencia con la implementación antes de usarlo.

## 6. Mantenimiento de esta guía

- Actualiza este archivo cuando cambien procedimientos, restricciones o puntos de entrada
  necesarios para trabajar. Actualiza la referencia de arquitectura si cambia un contrato entre subsistemas.
- Verifica las afirmaciones en el código. No declares una auditoría completa por haber revisado una parte.
- Evita duplicar versiones de paquetes, catálogos de tablas/rutas y listas completas de variables o scripts.
- Los resultados de pruebas, recuentos de avisos e historial de arreglos pertenecen al informe
  del cambio o a Git, no a esta guía.
- Mantén una única guía operativa; enlaza documentación especializada sin copiarla aquí.
