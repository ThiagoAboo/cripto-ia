#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
node --test frontend/src/lib/dashboard.test.js frontend/src/lib/format.test.js
