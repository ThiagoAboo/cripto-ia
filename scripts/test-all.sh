#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
./scripts/test-backend.sh
./scripts/test-frontend.sh
