#!/bin/sh
set -e

# Sync dependencies in container volume if missing
if [ ! -d "/app/node_modules/pdfkit" ] || [ ! -d "/app/node_modules/@prisma/client" ]; then
  echo "Syncing dependencies in node_modules volume..."
  npm install --prefer-offline --no-audit
fi

npx prisma generate

echo "Waiting for PostgreSQL database to be ready..."
MAX_RETRIES=15
COUNT=0
until npx prisma db push --accept-data-loss; do
  COUNT=$((COUNT + 1))
  if [ "$COUNT" -ge "$MAX_RETRIES" ]; then
    echo "Database connection failed after $MAX_RETRIES attempts."
    exit 1
  fi
  echo "Database not ready yet (attempt $COUNT/$MAX_RETRIES). Retrying in 3 seconds..."
  sleep 3
done

node prisma/seed.js || true

exec "$@"
