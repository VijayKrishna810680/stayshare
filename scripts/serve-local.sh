#!/usr/bin/env bash
# Start the production (standalone) build locally with .env loaded.
set -a; . ./.env; set +a
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
exec node .next/standalone/server.js
