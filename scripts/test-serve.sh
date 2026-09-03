#!/bin/bash
cd /d/FreeRoute
export PATH="/c/Program Files/nodejs:$PATH"
# Load secrets from env file (gitignored)
set -a; source /d/FreeRoute/data/test-e2e.env; set +a
exec node dist/src/cli.js serve
