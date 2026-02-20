#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ -x "$SCRIPT_DIR/generate-file-index.sh" ]]; then
  "$SCRIPT_DIR/generate-file-index.sh"
else
  bash "$SCRIPT_DIR/generate-file-index.sh"
fi

echo "Build complete."
