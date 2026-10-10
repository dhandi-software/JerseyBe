#!/bin/sh
set -e

npx prisma generate
npx prisma db push --accept-data-loss
node prisma/seed.js || true

exec "$@"
