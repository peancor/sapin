# AGENTS.md

> Auditado contra el código fuente el `2026-04-16`.
> Documento canónico para agentes y colaboradores. Si algo aquí contradice `README.md` u otra documentación antigua, prevalece `AGENTS.md` y después el código.

## Regla de mantenimiento

- Actualiza este archivo cuando cambien `package.json`, el esquema Drizzle, auth/roles, rutas principales, variables de entorno o subsistemas importantes.
- `CLAUDE.md` debe limitarse a apuntar aquí para evitar duplicidades.
- Si una afirmación no se puede verificar en el código actual, no la añadas.

## Resumen

**Sapin** es una plataforma EdTech full-stack sobre SvelteKit para cursos interactivos con IA. El producto actual incluye:

- actividades de chat
- actividades agénticas con tools y UI estructurada
- lecciones ramificadas
- RAG con Qdrant
- analítica clásica y analítica operativa/pedagógica
- `insights-agent`
- `staff-agent` con workspaces e hilos
- memoria persistente para agentes
- sistema propio de ficheros, notificaciones y auditoría

Perfiles principales:

- administración
- profesorado y asistentes
- estudiantes

## Stack actual

### Plataforma

- `SvelteKit 2.50.1` con `@sveltejs/adapter-node`
- `Svelte 5.48.0`
- `TypeScript 5.9.3`
- `Vite 7.3.1`
- `Node.js >= 22.14.0`

### UI y frontend

- `Tailwind CSS 4.1.18`
- `Flowbite Svelte 1.31.0`
- `lucide-svelte`
- `ECharts`
- `TipTap 3`
- `KaTeX`, `JSXGraph`, `TikzJax`
- `@ai-sdk/svelte`

### Datos e IA

- `SQLite` + `better-sqlite3`
- `Drizzle ORM` + `drizzle-kit` + `drizzle-zod`
- Vercel AI SDK v6 (`ai`)
- proveedores soportados: `openai`, `openrouter`, `anthropic`, `google`, `lmstudio`, `custom`
- Qdrant para embeddings y RAG

### Servicios auxiliares

- `Inlang Paraglide JS`
- `Cloudflare Turnstile`
- `Nodemailer`
- `node-cron`
- `Pino`
- notificador opcional de Telegram

## Configuración y entorno

Variables importantes detectadas en `.env.example` y el código:

- `DATABASE_URL`
- `ORIGIN`
- `MODERATE_PROMPTS`
- `PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `ENABLE_TELEGRAM_NOTIFICATIONS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `EMBEDDINGS_OPENROUTER_API_KEY`
- `FILES_STORAGE_PATH`
- `FILES_TEMP_PATH`
- `FILES_DELETED_PATH`
- `OPENAI_MODERATION_API_KEY`

Notas operativas:

- El proyecto exige `DATABASE_URL`.
- En local se espera `DATABASE_URL=local.db`.
- `ORIGIN` se usa para URLs absolutas y cabeceras referer.
- Las rutas de ficheros se resuelven relativas a `process.cwd()` si no son absolutas.

## Scripts relevantes

### Desarrollo

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run check`
- `npm run check:watch`
- `npm run lint`
- `npm run format`

### Base de datos

- `npm run db:push`
- `npm run db:migrate`
- `npm run db:generate`
- `npm run db:studio`

### Docker y utilidades

- `npm run docker:build`
- `npm run docker:up`
- `npm run docker:down`
- `npm run docker:restart`
- `npm run docker:clean`
- `npm run docker:logs`
- `npm run docker:ps`
- `npm run docker:secret`
- `npm run docker:prod:up`
- `npm run docker:prod:update`
- `npm run docker:qdrant:debug:up`
- `npm run docker:qdrant:debug:down`
- `npm run machine-translate`
- `npm run db:backfill-agent-ui-components`

## Estructura del repositorio

### Raíz

- `src/`: aplicación principal
- `drizzle/`: migraciones
- `messages/`: traducciones
- `docs/`: documentación complementaria
- `scripts/`: scripts auxiliares
- `uploads/`: almacenamiento local
- `build/`: salida de producción

### Documentación local útil

- `docs/agent-upgrade-plan.md`
- `docs/docker-production.md`
- `README.md`

### Scripts auxiliares detectados

- `scripts/backfill-agent-ui-components.ts`
- `scripts/legacy-interactive-learning-files-transfer.ts`
- `scripts/migrate-course-table-upgrade.ts`
- `scripts/prepare-tikzjax-browser-tex-files.mjs`
- `scripts/seed-roles.ts`

## Mapa de `src/`

### Núcleo

- `src/app.d.ts`: tipa `App.Locals` y Turnstile
- `src/hooks.server.ts`: logging, auth y Paraglide
- `src/routes/+layout.server.ts`: bootstrap redirect si no hay usuarios

### Frontend compartido

- `src/lib/components/`: `activity-debugger`, `agent`, `charts`, `insights`, `notifications`, `staff-agent`, `tikzjax`
- `src/lib/stores/`: `analytics`, `breadcrumb`, `insights`, `navigation`, `response`, `theme`, `topbarNavigation`, `user`
- `src/lib/helpers/`: `dateUtils.ts` y plantillas de system prompt
- `src/lib/paraglide/`: generado; no editar a mano

### Backend compartido

- `src/lib/server/ai/`
- `src/lib/server/agent/`
- `src/lib/server/insights-agent/`
- `src/lib/server/staff-agent/`
- `src/lib/server/learning-evidence/`
- `src/lib/server/db/`
- `src/lib/server/files/`
- `src/lib/server/qdrant/`
- `src/lib/server/notifications/`
- `src/lib/server/notifier/`
- `src/lib/server/integrations/moodle/`
- `src/lib/server/logging/`

## Rutas principales

### App

`src/routes/(app)` contiene la mayor parte del producto:

- `admin/`
- `agent-chat/`
- `course/`
- `dashboard/`
- `interactive-chat/`
- `lesson/`
- `notifications/`
- `profile/`
- `student/`
- `teacher/`
- `tutor/`
- `(misc)/`
- `login/`, `logout/`, `register/`

Hay bootstrap en `/admin/bootstrap` y demos específicas como `demo-tikzjax`.

### API

`src/routes/api` agrupa endpoints de:

- `admin`
- `agent-chat`
- `ai`
- `analytics`
- `course`
- `courses`
- `files`
- `interactive`
- `interactive-chat`
- `invite`
- `lesson`
- `notifications`
- `tutor`

Además hay endpoints específicos para mantenimiento, Qdrant, playgrounds, importación Moodle, `staff-agent` e `insights-agent`.

## Auth, sesión y bootstrap

### Sesión

- Cookie de sesión: `auth-session`
- El token se hashea con `sha256` antes de persistirse
- Duración: `30` días
- Renovación automática cuando quedan `15` días o menos

### Carga de `locals`

`src/hooks.server.ts`:

- lee la cookie
- valida la sesión en BD
- refresca o elimina la cookie
- rellena `event.locals.user` y `event.locals.session`
- aplica `paraglideMiddleware`

### Bootstrap inicial

`src/routes/+layout.server.ts`:

- consulta si existe al menos un usuario
- redirige a `/admin/bootstrap` cuando el sistema no está inicializado
- exceptúa algunas rutas públicas como `/admin/bootstrap` y `/favicon.ico`

## Roles y autorización

### Roles de sistema

Definidos en `src/lib/server/roles.ts`:

- `SUPER_ADMIN = 100`
- `ADMIN = 90`
- `TEACHER = 50`
- `ASSISTANT = 40`
- `STUDENT = 10`

`locals.user` incluye:

- `roles`
- `highestRole`
- `highestRoleLevel`

Los roles se cargan desde las tablas `role` y `user_role`, filtrando asignaciones activas y no expiradas.

### Roles de curso

`CourseRoleUtils.ts` define niveles propios:

- `owner = 100`
- `admin = 90`
- `teacher = 70`
- `assistant = 50`
- `grader = 30`
- `student = 10`

También define permisos por defecto por rol para:

- edición de curso
- borrado
- gestión de usuarios
- creación de actividades
- corrección
- analítica
- ejecución de actividades

### Protección observada en layouts

- `(app)/admin/+layout.server.ts`: requiere `highestRoleLevel >= 90`
- `course/[cid]/admin/+layout.server.ts`: permite admin de sistema o rol de curso `>= assistant`
- `course/[cid]/run/+layout.server.ts`: requiere usuario autenticado y algún rol activo en el curso

Regla práctica:

- aunque haya layouts protegidos, cada `+server.ts` debe validar auth y permisos dentro del handler

## Cron jobs

En `src/hooks.server.ts` se programan:

- limpieza diaria de ficheros a las `03:00`
- procesado de imágenes pendientes cada `15` minutos

Servicios implicados:

- `FileCleanupService`
- `ImageProcessingQueue`

## Base de datos y esquema

El esquema Drizzle vive en `src/lib/server/db/schema/` y se reexporta desde `index.ts`.

### Tablas principales por archivo

| Archivo | Tablas / grupos clave |
| --- | --- |
| `users.ts` | `user`, `session` |
| `roles.ts` | `role`, `user_role`, `role_audit_log` |
| `courses.ts` | `course`, `invite`, `course_file`, `course_role` |
| `chat.ts` | `chat`, `message` |
| `interactive.ts` | `interactive_learning`, `course_interactive_learning`, `interactive_learning_chat`, `user_interactive_learning_chat`, `interactive_learning_file`, `interactive_learning_rag_document` |
| `lesson.ts` | `interactive_learning_lesson`, `interactive_lesson_session`, `interactive_lesson_block_state`, `interactive_lesson_event` |
| `progress.ts` | `learning_activity_progress`, `learning_progress_event`, `course_progress_summary` |
| `files.ts` | `file_storage`, `file_access_log`, `file_system_setting` |
| `notifications.ts` | `notification` |
| `audit.ts` | `audit_log` |
| `system.ts` | `app_setting` |
| `analytics.ts` | `analytics_session`, `analytics_event`, `analytics_daily_stats` |
| `ai.ts` | `ai_provider`, `ai_model`, `ai_request_capture_focus`, `ai_request_round`, `ai_usage_log`, `ai_quota`, `ai_usage_daily_stats` |
| `agent.ts` | catálogo de tools/UI, `interactive_learning_agent`, `agent_activity_tool`, `agent_message`, `agent_tool_call`, `agent_ui_instance` |
| `insightsAgent.ts` | `interactive_learning_insights_agent`, `insights_agent_activity_tool`, `insights_agent_run` |
| `agentWorkspace.ts` | `agent_workspace`, `agent_workspace_tool`, `agent_thread` |
| `memory.ts` | `agent_memory_canvas`, revisiones y eventos de sincronización |

### Helpers DB importantes

En `src/lib/server/db/` ya existen utilidades reutilizables:

- `DBUserUtils`
- `DBCourseUtils`
- `DBChatUtils`
- `DBAgentUtils`
- `LoginUtils`
- `RoleUtils`
- `CourseRoleUtils`
- `InteractiveChatAuthUtils`
- `CourseInteractiveAuthUtils`
- `InvitationUtils`
- `LearningAnalyticsUtils`
- `ProgressUtils`
- `ProgressWriteUtils`
- `ProgressRebuildUtils`

## Subsistema de IA

### Resolver y modelos

- `ModelResolver` obtiene modelos activos desde BD
- si la BD no devuelve nada, usa fallback hardcoded
- el modelo por defecto también se resuelve desde BD con fallback
- las API keys de proveedor viven en `ai_provider`

### `AIUtils`

`src/lib/server/ai/AIUtils.ts` centraliza:

- listado y resolución de modelos
- comprobación de cuota
- logging de uso
- streaming y generación de texto
- recuperación y guardado de mensajes
- construcción de system prompt
- obtención de contexto RAG
- notificación al cerrar chats

### Cuotas y trazabilidad

El sistema ya soporta:

- cuotas globales, por usuario, curso o actividad
- costes y tokens por modelo
- captura detallada de rondas IA (`ai_request_round`)
- foco de captura para actividad o sesión (`ai_request_capture_focus`)

### Imagen y RAG

- `AIImageUtils.ts` genera imagen vía OpenRouter
- `RagService.ts` genera embeddings, consulta Qdrant, fusiona chunks y construye contexto acotado
- las actividades soportan `ragEnabled`, `ragCollectionName` y `ragConfig`

## Agentes, tools y UI estructurada

### Motor agéntico

El proyecto usa `ToolLoopAgent` del AI SDK v6 en:

- `StaffAgentEngine`
- `InsightsAgentEngine`

Piezas principales del subsistema:

- `ToolManager`
- `ToolExecutor`
- `AgentStreamProcessor`
- `AgentPromptBuilder`
- `AgentFinalizationService`
- `AgentUIRendererService`
- `AgentTranscriptService`
- `AgentSessionAnalyticsService`

### Herramientas del agente

Bajo `src/lib/server/agent/tools/` hay tools para:

- búsqueda de contenido
- evaluación y rúbricas
- analítica operativa
- redacción de feedback/intervenciones
- notificaciones
- renderizado de quizzes, flashcards, diagramas SVG/TikzJax y tests cognitivos
- lectura/escritura de canvases de memoria

### HITL y respuestas UI

El flujo ya contempla:

- herramientas con `requiresConfirmation`
- estado `awaiting_confirmation`
- espera de respuesta UI
- persistencia de `agent_tool_call`
- persistencia de `agent_ui_instance`

### Variantes actuales

- `interactive_learning_agent`: actividad agéntica dentro de cursos
- `interactive_learning_insights_agent`: agente analítico por actividad
- `agent_workspace` + `agent_thread`: workspaces e hilos del `staff-agent`

## Memoria agéntica

Existe memoria persistente/canvas en:

- `agent_memory_canvas`
- `agent_memory_canvas_revision`
- `agent_memory_canvas_sync_event`

Servicios relacionados:

- `src/lib/server/agent/memory/AgentMemoryService.ts`
- `CanvasScopeRegistry.ts`
- `MemoryScopeResolver.ts`

## Actividades y lecciones

`interactive_learning` es la entidad base de actividad. Hoy el producto soporta claramente:

- chat
- actividad agéntica
- lección

El subsistema de lecciones soporta:

- política de sesión (`resume_latest` / `always_new_attempt`)
- reintentos
- estado por bloque
- eventos de sesión
- chats asociados a bloques

Rutas y APIs relacionadas viven en:

- `src/routes/(app)/course/[cid]/run/lesson/...`
- `src/routes/api/lesson/...`
- `src/routes/(app)/course/[cid]/admin/interactives/[ilid]/lesson-review/...`

## Ficheros, imágenes y Qdrant

### Almacenamiento

`FileStorageService` implementa:

- validación por categoría
- hash SHA-256
- deduplicación
- sharding por hash en disco
- estadísticas de acceso
- visibilidad `public` / `private` / `restricted`

Categorías observadas:

- `avatar`
- `course`
- `chat`
- `rag_document`
- `public`

### Procesado

- las imágenes procesables se envían a `ImageProcessor`
- el estado de procesado se persiste en BD
- existe cola periódica de procesado y limpieza

### Qdrant

`src/lib/server/qdrant/` contiene:

- cliente singleton
- comprobación de conexión
- gestión de colecciones
- inserción y búsqueda de puntos
- pipeline de documentos y embeddings

## Notificaciones y auditoría

### Notificaciones

Hay dos capas:

- `NotificationService`: notificaciones in-app y email
- `notifier`: Telegram o `VoidNotifier` para avisos rápidos de algunos flujos IA

La configuración de notificaciones se guarda en `app_setting`.

### Auditoría

`AuditService`:

- persiste en `audit_log`
- cachea configuración desde `app_setting`
- soporta categorías y retención
- registra eventos relevantes del sistema

## Analítica y learning evidence

### Analítica clásica

`analytics.ts` define:

- sesiones
- eventos
- estadísticas diarias

### Learning evidence / operativa

`src/lib/server/learning-evidence/` incluye:

- `LearningEvidenceService`
- `ActivityAnalyticsService`
- `ActivityMicroAnalyticsService`
- `AdvancedInsightsService`
- `PedagogicalDiagnosticsService`
- `PedagogicalSupportService`
- `TeacherActionQueueService`
- `SafeActuationService`
- `operationalAnalytics.ts`

## Integraciones externas

### Moodle

`src/lib/server/integrations/moodle/MoodleClient.ts`:

- llama a `core_enrol_get_enrolled_users`
- filtra alumnos por rol
- se usa en flujos de importación/preview/confirm

### MCP local

`mcp.json` declara:

- servidor HTTP de Svelte MCP
- servidor local de Flowbite Svelte

## i18n y build

### i18n

- locale base: `es`
- locale secundaria: `en`
- Paraglide se configura en `vite.config.ts`
- estrategia: `url`, `cookie`, `baseLocale`
- `src/lib/paraglide/` es generado

### Build

- `svelte.config.js` usa `adapter-node`
- `vite.config.ts` prepara assets de TikzJax antes de exportar la config
- `postbuild` copia `myserver.js` dentro de `build/`
- `drizzle.config.ts` apunta a `src/lib/server/db/schema/index.ts`

## Convenciones prácticas

- componentes Svelte en `PascalCase.svelte`
- utilidades de servidor agrupadas en `src/lib/server/...`
- esquema Drizzle centralizado en `src/lib/server/db/schema/`
- auth y permisos siempre explícitos en endpoints
- reutilizar helpers DB antes que duplicar consultas en rutas
- en flujos IA, comprobar cuota y registrar uso antes de asumir éxito

## Estado actual de testing

No hay un `npm test` oficial en `package.json`, pero sí existen tests propios con `node:test`, por ejemplo:

- `src/lib/math/expressionScope.test.ts`
- `src/lib/server/agent/tools/operationalTools.manifest.test.ts`
- `src/lib/server/learning-evidence/operationalAnalytics.test.ts`

Conclusión práctica:

- la verificación mínima hoy es `npm run check` + `npm run lint`
- si se amplía el set de tests, conviene añadir un script oficial y documentarlo aquí

## Ficheros generados o derivados

No editar a mano salvo que el flujo lo requiera explícitamente:

- `src/lib/paraglide/`
- `build/`
- `.svelte-kit/`
- `node_modules/`

## Qué mirar primero según el cambio

- auth / sesión / bootstrap: `src/hooks.server.ts`, `src/lib/server/auth.ts`, `src/routes/+layout.server.ts`
- roles y permisos: `src/lib/server/roles.ts`, `src/lib/server/db/RoleUtils.ts`, `src/lib/server/db/CourseRoleUtils.ts`
- modelos IA y cuotas: `src/lib/server/ai/AIUtils.ts`, `src/lib/server/ai/services/ModelResolver.ts`, `UsageTracker.ts`
- actividades agénticas: `src/lib/server/agent/`, `src/lib/server/db/schema/agent.ts`
- insights agent: `src/lib/server/insights-agent/`, `src/lib/server/db/schema/insightsAgent.ts`
- staff agent: `src/lib/server/staff-agent/`, `src/lib/server/db/schema/agentWorkspace.ts`
- lecciones: `src/lib/server/db/schema/lesson.ts`, rutas `lesson`
- revisión pedagógica de lessons: `src/lib/server/lesson/LessonReviewService.ts`, rutas `lesson-review`
- ficheros y RAG: `src/lib/server/files/`, `src/lib/server/qdrant/`, `src/lib/server/ai/services/RagService.ts`
- notificaciones: `src/lib/server/notifications/`, `src/lib/server/notifier/`
- analítica pedagógica: `src/lib/server/learning-evidence/`

## Nota final

Este documento sustituye a `CLAUDE.md` como guía operativa central del proyecto. Si más adelante cambian arquitectura, scripts o modelo de datos, actualiza primero `AGENTS.md` y deja `CLAUDE.md` solo como puntero.
