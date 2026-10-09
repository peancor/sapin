# Arquitectura de Sapin

Referencia de los contratos que conviene preservar al modificar el producto.
Las instrucciones de trabajo están en [AGENTS.md](../AGENTS.md).
Consulta el código enlazado para los campos, valores y detalles de implementación actuales.

## Sesión, roles e identidad

[hooks.server.ts](../src/hooks.server.ts) valida la sesión y carga el usuario en `locals`.
[auth.ts](../src/lib/server/auth.ts) gestiona tokens y cookies; el
[layout raíz](../src/routes/+layout.server.ts) dirige al bootstrap cuando no hay usuarios.

Los [roles de sistema](../src/lib/server/roles.ts) y los
[roles de curso](../src/lib/server/db/CourseRoleUtils.ts) son ámbitos distintos.
Las consultas de cursos y usuarios pueden devolver varias asignaciones activas para una
misma persona y curso. `assignmentId` identifica cada fila; `userId` y `courseId` siguen
siendo los identificadores para acciones y navegación. Deduplicar esas filas cambia su significado.
La lista de estudiantes y los contadores de administración del curso proyectan esas
asignaciones a una fila por persona mediante `distinctCourseStudents`. Esta vista no
modifica las asignaciones ni el contrato de `getCourseUsers`. Dar de baja a una persona
desactiva todos sus roles activos de estudiante en ese curso y conserva sus otros roles.

## Modelos y ejecución agéntica

[AIUtils](../src/lib/server/ai/AIUtils.ts) centraliza generación, cuotas y registro de uso.
[ModelResolver](../src/lib/server/ai/services/ModelResolver.ts) resuelve modelos desde BD
y contempla fallbacks; no todos los subsistemas admiten esos fallbacks, como ocurre en el radar.

Las actividades agénticas, el agente analítico y el agente docente tienen persistencia propia:
consulta los esquemas [agent](../src/lib/server/db/schema/agent.ts),
[insightsAgent](../src/lib/server/db/schema/insightsAgent.ts) y
[agentWorkspace](../src/lib/server/db/schema/agentWorkspace.ts).
La memoria persistente se gestiona en [agent/memory](../src/lib/server/agent/memory/).

[ToolManager](../src/lib/server/agent/ToolManager.ts) construye las herramientas para el SDK.
[defineBuiltinToolPackage](../src/lib/server/agent/tools/defineBuiltinToolPackage.ts)
valida los argumentos con el mismo conversor de esquemas antes de invocar el handler;
[ToolExecutor](../src/lib/server/agent/ToolExecutor.ts) resuelve la herramienta habilitada
y propaga el contexto. El manifiesto y el tipo de entrada del handler deben mantenerse alineados.

La confirmación humana y las respuestas UI son pasos persistidos del flujo. Una llamada
pertenece a un mensaje y una conversación: su identificador no basta para autorizarla.
Las pruebas de confirmación con calculadora ejercitan el endpoint real, incluida la
repetición de llamadas y el rechazo de llamadas de otra conversación.

## Lecciones, revisiones y progreso

[LessonRevisionService](../src/lib/server/lesson/LessonRevisionService.ts),
[LessonService](../src/lib/server/lesson/LessonService.ts) y
[LessonReviewService](../src/lib/server/lesson/LessonReviewService.ts) comparten estos contratos:

- El editor trabaja con `draft`; publicar actualiza `published` y mantiene
  `interactiveLearning.content` como copia compatible.
- Las sesiones se vinculan mediante `definitionRevisionId`. Runtime y revisión usan
  esa definición, no el borrador actual. Las sesiones legacy sin revisión no se reutilizan
  ni se incluyen en la revisión del alumnado.
- `learner`, `preview_published` y `preview_draft` separan ejecución real y previews.
  Los previews no deben contaminar progreso ni analítica del alumnado.
- Los bloques de YouTube se desbloquean cuando el endpoint de progreso confirma su
  finalización; el estado local del reproductor no sustituye esa confirmación.

## Ficheros, adjuntos e importación

[FileStorageService](../src/lib/server/files/FileStorageService.ts) centraliza validación,
deduplicación, almacenamiento y visibilidad. Las rutas relativas de almacenamiento se
resuelven desde `process.cwd()`; cambiar el directorio de ejecución puede cambiar su destino.

[AgentMessageAttachmentService](../src/lib/server/agent/AgentMessageAttachmentService.ts)
sube los adjuntos antes del envío SSE y los enlaza después al mensaje. Conserva imágenes
WebP sanitizadas; el agente recibe imágenes solo si el modelo declara capacidad compatible.

[ActivityPackageService](../src/lib/server/activity/ActivityPackageService.ts) exporta
actividades chat/agent como `.sapinactivity.zip`;
[LessonPackageService](../src/lib/server/lesson/LessonPackageService.ts) usa `.sapinlesson.zip`.
Al importar actividades, se crean nuevos registros de ficheros. Los documentos RAG quedan
`pending`, con RAG desactivado y sin reutilizar la colección de origen, hasta su reindexación.

## Analítica y radar

[learning-evidence](../src/lib/server/learning-evidence/) concentra la analítica pedagógica.
El [radar](../src/lib/server/radar/) analiza mensajes de alumnado con matrícula activa;
excluye roles docentes y disparadores internos, y usa respuestas del asistente como contexto.
Sus observaciones conservan referencias a fuentes, sin copiar transcripciones.

Cada operación verifica permiso docente, relación curso–actividad y ámbito del seguimiento.
El procesamiento revalida permisos del creador, aplica cuotas y solo usa modelos activos de BD.
El planificador continúa sin navegador, usa arrendamientos persistentes y está desactivado
durante build y pruebas. Los borrados de usuarios, intentos y chats invalidan interpretaciones
dependientes y eliminan sus evidencias. Consulta el [piloto del radar](radar-pilot.md).

## HTML, traducciones y build

[SafeHtml](../src/lib/components/SafeHtml.svelte) sanitiza el HTML final después de renderizar
Markdown/KaTeX, tanto en servidor como en navegador. Los chats, informes, asistentes de edición
y ejercicios lo comparten. La excepción local de ESLint está limitada a ese componente;
no permite insertar HTML sin limpiar en sus consumidores.

[vite.config.ts](../vite.config.ts) configura Paraglide y prepara assets de TikzJax.
Las traducciones se editan en `messages/`; `src/lib/paraglide/` es generado.
[svelte.config.js](../svelte.config.js) usa adapter-node y el postbuild copia `myserver.js`
mediante [copy-server.mjs](../scripts/copy-server.mjs). Docker es una opción auxiliar;
su documentación no implica que producción se despliegue con contenedores.

## Qué demuestran las pruebas

[npm test](../package.json) ejecuta `node:test` con un loader de alias SvelteKit.
[Playwright](../playwright.config.ts) usa un servidor compilado y datos ficticios preparados
por [e2e-server.mjs](../scripts/e2e-server.mjs) y [e2e-seed.ts](../scripts/e2e-seed.ts).

Las simulaciones de SSE y recepción de respuestas UI comprueban el comportamiento del cliente,
no la ejecución del modelo ni toda la persistencia del servidor. Qdrant se simula para consultas
de versión y listado vacío de colecciones; el correo se comprueba sin entrega externa.

[integration-smoke.ts](../scripts/integration-smoke.ts) cubre llamadas reales de streaming,
visión, herramientas y embeddings con contenido ficticio, además de búsqueda Qdrant en una
colección temporal local. Lee la configuración de proveedor/modelo de la BD local en modo
solo lectura. Es una comprobación opt-in con consumo de tokens, no parte de la suite ordinaria.
