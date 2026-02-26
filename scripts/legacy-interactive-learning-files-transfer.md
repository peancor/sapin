# Legacy Interactive Learning Files Transfer

Script: `scripts/legacy-interactive-learning-files-transfer.ts`

Objetivo:
- Exportar datos de tablas legacy desde una base **no migrada**:
  - `interactive_learning_chat_file`
  - `interactive_learning_chat_rag_document`
- Importar esos datos en una base **ya migrada**:
  - `interactive_learning_file`
  - `interactive_learning_rag_document`

## Requisitos

- Node + `tsx` disponible (ya usado en este repo con `npx tsx ...`).
- Acceso al fichero SQLite de origen/destino (`--db=...` o `DATABASE_URL`).

## Comando de export

```bash
npx tsx scripts/legacy-interactive-learning-files-transfer.ts export --db=RUTA_DB_ANTIGUA --out=legacy-export.json
```

Opciones útiles:
- `--dry-run`: no escribe fichero, solo muestra resumen.
- `--out=PATH`: ruta del JSON de salida.
- `--db=PATH`: ruta de la base origen (si no se pasa, usa `DATABASE_URL` o `./sapin.db`).

## Comando de import

```bash
npx tsx scripts/legacy-interactive-learning-files-transfer.ts import --db=RUTA_DB_MIGRADA --file=legacy-export.json --backup
```

Opciones útiles:
- `--dry-run`: simula import sin escribir.
- `--backup`: crea backup previo de la DB destino.
- `--on-conflict=error|skip|replace`: política de conflicto por `id` (por defecto `error`).
- `--skip-missing-il`: omite filas cuyo `interactive_learning_id` no exista en destino.
- `--no-link-storage`: no intenta inferir `file_storage_id` desde rutas `/api/files/<id>`.

## Flujo recomendado

1. Exportar desde DB antigua:
```bash
npx tsx scripts/legacy-interactive-learning-files-transfer.ts export --db=./sapin-pre-migracion.db --out=./legacy-il-files.json
```

2. Revisar resumen del JSON generado.

3. Migrar esquema manualmente (drop de legacy + mantener tablas nuevas).

4. Importar en DB ya migrada:
```bash
npx tsx scripts/legacy-interactive-learning-files-transfer.ts import --db=./sapin-post-migracion.db --file=./legacy-il-files.json --backup --on-conflict=error
```

5. (Opcional) Repetir en modo simulación primero:
```bash
npx tsx scripts/legacy-interactive-learning-files-transfer.ts import --db=./sapin-post-migracion.db --file=./legacy-il-files.json --dry-run
```

## Notas de mapeo

- `interactive_learning_chat_file.interactive_learning_chat_id` -> `interactive_learning_file.interactive_learning_id`
- `interactive_learning_chat_rag_document.interactive_learning_chat_id` -> `interactive_learning_rag_document.interactive_learning_id`
- `file_storage_id` no existe en legacy; el script intenta inferirlo desde:
  - `path` (chat files)
  - `original_path` (rag docs)
  si siguen patrón `/api/files/<id>` y existe el `id` en `file_storage`.

## Salidas y trazabilidad

El JSON de export incluye:
- `version`
- `exportedAt`
- `sourceDatabasePath`
- `summary`
- `data.chatFiles[]`
- `data.ragDocuments[]`

Con eso puedes repetir importaciones en distintos entornos (staging/producción) usando el mismo snapshot.
