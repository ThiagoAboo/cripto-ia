#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-.}"

check_file_lines() {
  local file_path="$1"
  local warn_threshold="$2"
  local block_threshold="$3"

  if [[ ! -f "$ROOT_DIR/$file_path" ]]; then
    echo "WARN  missing file: $file_path"
    return 0
  fi

  local line_count
  line_count=$(wc -l < "$ROOT_DIR/$file_path")
  if (( line_count > block_threshold )); then
    echo "BLOCK $file_path has $line_count lines (threshold: $block_threshold)"
  elif (( line_count > warn_threshold )); then
    echo "WARN  $file_path has $line_count lines (threshold: $warn_threshold)"
  else
    echo "OK    $file_path has $line_count lines"
  fi
}

check_test_script() {
  local package_json="$1"
  if [[ ! -f "$ROOT_DIR/$package_json" ]]; then
    echo "WARN  missing package file: $package_json"
    return 0
  fi

  if grep -q '"test"' "$ROOT_DIR/$package_json"; then
    echo "OK    $package_json exposes test script"
  else
    echo "BLOCK $package_json missing test script"
  fi
}

echo "== maintenance audit =="
check_file_lines "frontend/src/App.jsx" 80 120
check_file_lines "ai/main.py" 500 800
check_file_lines "social-worker/main.py" 350 500
check_test_script "backend/package.json"
check_test_script "frontend/package.json"

if [[ -f "$ROOT_DIR/backend/src/contracts/public-api.contract.json" ]]; then
  echo "OK    backend/src/contracts/public-api.contract.json present"
else
  echo "WARN  backend/src/contracts/public-api.contract.json missing"
fi
