#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ -x "$SCRIPT_DIR/Scripts/build.sh" ]]; then
  "$SCRIPT_DIR/Scripts/build.sh"
else
  bash "$SCRIPT_DIR/Scripts/build.sh"
fi
