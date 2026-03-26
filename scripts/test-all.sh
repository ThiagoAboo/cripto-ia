#!/usr/bin/env bash
set -euo pipefail

bash scripts/test-backend.sh
bash scripts/test-frontend.sh
