#!/bin/sh
set -e

npx prisma generate
npx prisma migrate deploy
node prisma/seed.js || true

exec "$@"
