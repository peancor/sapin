#!/bin/sh
set -eu

export DATABASE_URL="${DATABASE_URL:-/data/sapin.db}"
export FILES_STORAGE_PATH="${FILES_STORAGE_PATH:-/data/files/uploads}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"

if [ -z "${SECRET_KEY:-}" ]; then
  echo "SECRET_KEY is required" >&2
  exit 1
fi

if ! printf '%s' "$SECRET_KEY" | grep -Eq '^[0-9a-fA-F]{64}$'; then
  echo "SECRET_KEY must be 64 hexadecimal characters" >&2
  exit 1
fi

mkdir -p /data/files/uploads
mkdir -p "$(dirname "$DATABASE_URL")"

echo "Running database migrations (db:migrate)..."
npm run db:migrate

echo "Starting Sapin on ${HOST}:${PORT}"
exec node build/index.js
