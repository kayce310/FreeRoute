#!/usr/bin/env bash
cd D:/FreeRoute
export PATH="/c/Program Files/nodejs:$PATH"
export FREEROUTE_MASTER_SECRET="testmastersecret123"
export FREEROUTE_API_TOKEN="testapitoken12345"
export FREEROUTE_DATA_DIR="D:/FreeRoute/data/test-e2e"
exec node dist/src/cli.js serve
