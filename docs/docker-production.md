# Despliegue en Producción con Docker Hub

Guía rápida para desplegar Sapin en servidor usando imagen publicada en Docker Hub.

Incluye stack completo listo para usar:

- `sapin` (app)
- `qdrant` (vector DB)

Qdrant se conecta de forma interna por red Docker (`http://qdrant:6333`) y no publica puerto al host por defecto.

## 1) Preparar entorno

1. Copia el ejemplo:

```bash
cp .env.production.example .env.production
```

2. Edita `.env.production`:

- `SECRET_KEY`: 64 caracteres hexadecimales.
- `ORIGIN`: URL pública final (ej. `https://app.midominio.com`).
- Variables opcionales según integraciones (Qdrant, Turnstile, Telegram, etc.).
  - Por defecto `QDRANT_URL=http://qdrant:6333` (servicio local del compose).

Puedes generar una clave válida con:

```bash
npm run docker:secret
```

## 2) Primer despliegue (pull desde Docker Hub)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Atajos npm equivalentes:

```bash
npm run docker:prod:pull
npm run docker:prod:up
```

## 3) Verificación

```bash
npm run docker:prod:ps
npm run docker:prod:logs
```

El servicio debe quedar `healthy` y escuchando en el puerto definido por `SAPIN_PORT`.

## 4) Actualización de versión

Si usas `SAPIN_IMAGE=peancor/sapin:latest` o un tag nuevo:

```bash
npm run docker:prod:update
```

## 5) Backup y restore de datos

Sapin persiste datos en el volumen `data` (`/data` dentro del contenedor):

- DB: `/data/sapin.db`
- Archivos: `/data/files/...`

Qdrant persiste sus índices en el volumen `qdrant_data`.

### Backup (tar local)

```bash
docker run --rm -v sapin_data:/data -v ${PWD}:/backup alpine sh -c "tar czf /backup/sapin-data-backup.tar.gz -C /data ."
docker run --rm -v sapin_qdrant_data:/qdrant -v ${PWD}:/backup alpine sh -c "tar czf /backup/sapin-qdrant-backup.tar.gz -C /qdrant ."
```

### Restore (sobrescribe volumen)

```bash
docker run --rm -v sapin_data:/data -v ${PWD}:/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/sapin-data-backup.tar.gz -C /data"
docker run --rm -v sapin_qdrant_data:/qdrant -v ${PWD}:/backup alpine sh -c "rm -rf /qdrant/* && tar xzf /backup/sapin-qdrant-backup.tar.gz -C /qdrant"
```

## 6) Publicar imagen en Docker Hub

Desde tu máquina de build:

```bash
docker build -t peancor/sapin:0.1.0 -t peancor/sapin:latest .
docker login
docker push peancor/sapin:0.1.0
docker push peancor/sapin:latest
```

Recomendación: promover versiones semánticas (`X.Y.Z`) y actualizar `latest` solo cuando la release esté validada.

## 7) Troubleshooting rápido

- Error `403 Cross-site POST form submissions are forbidden`:
  - revisa `ORIGIN` en `.env.production` y que coincida exactamente con la URL pública.
- Error de arranque por `SECRET_KEY`:
  - debe ser hex de 64 caracteres.
- No persisten datos:
  - confirma que el volumen `data` existe y que no estás usando `docker compose down -v` por accidente.
