# Publicar actividades de Sapin en Moodle

Esta guía explica cómo añadir una actividad de Sapin en Moodle cuando el alumnado debe entrar identificado con su usuario de Moodle.

## Opción recomendada: recurso URL de Moodle

Usa esta opción cuando vayas a crear en Moodle un recurso de tipo **URL**.

1. En Sapin, entra en el curso y localiza la actividad.
2. Pulsa el botón de enlace y elige **Recurso URL de Moodle**.
3. En Moodle, activa edición y añade un recurso de tipo **URL**.
4. En el campo **URL externa**, pega la URL copiada desde Sapin.
5. Abre la sección **Variables de URL**.
6. Añade una variable con estos valores:

| Campo en Moodle      | Valor          |
| -------------------- | -------------- |
| Nombre del parámetro | `id`           |
| Variable Moodle      | `Usuario > id` |

7. Guarda el recurso y pruébalo con una cuenta de estudiante.

Con esta configuración, Moodle añade automáticamente el identificador del estudiante al abrir Sapin.

## Importante: no usar FilterCodes en el campo URL

En un recurso **URL** de Moodle, no pegues enlaces como este:

```text
https://sapin.example.edu/student/run-chat/actividad?id={userid}
```

En ese campo, Moodle puede no procesar `{userid}`. Si no se procesa, Sapin recibe el texto literal y no puede identificar al estudiante.

Para recursos **URL**, usa siempre **Variables de URL** con:

```text
id = Usuario > id
```

## Opción compatible: contenido Moodle con FilterCodes

La opción **Contenido Moodle con FilterCodes** copia un enlace con este formato:

```text
https://sapin.example.edu/student/run-chat/actividad?id={userid}
```

Úsala solo cuando pegues el enlace dentro de contenidos donde Moodle sí procese FilterCodes, por ejemplo:

- página
- etiqueta
- libro
- texto enriquecido con FilterCodes activo

Si tienes dudas, usa la opción recomendada: **Recurso URL de Moodle**.

## Por qué Sapin recomienda `id`

Cuando se importa alumnado desde Moodle, Sapin guarda el ID interno de Moodle como identificador externo del estudiante. Por eso la variable debe apuntar a **Usuario > id**.

Sapin recomienda llamar `id` al parámetro porque es más sencillo de configurar en Moodle. Los enlaces antiguos con `externalId` o `externalid` siguen siendo compatibles.

No uses correo, nombre de usuario ni otros campos salvo que el equipo técnico haya cambiado también el proceso de importación.
