#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ -x "$SCRIPT_DIR/build.sh" ]]; then
  "$SCRIPT_DIR/build.sh"
else
  bash "$SCRIPT_DIR/build.sh"
fi
