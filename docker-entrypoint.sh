#!/bin/sh
set -e

echo "Applying database migrations..."
node cli/node_modules/prisma/build/index.js migrate deploy

echo "Ensuring initial admin user..."
node scripts/bootstrap-admin.mjs

exec node server.js
