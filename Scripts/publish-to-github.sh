#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not installed." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This folder is not a git repository." >&2
  echo "Run: git init" >&2
  exit 1
fi

COMMIT_MSG="${1:-chore: update file index and site}"
REMOTE_URL="${2:-}"

if [[ -n "$REMOTE_URL" ]]; then
  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "$REMOTE_URL"
  else
    git remote add origin "$REMOTE_URL"
  fi
fi

if [[ -x "./Scripts/build.sh" ]]; then
  ./Scripts/build.sh
elif [[ -f "./Scripts/build.sh" ]]; then
  bash ./Scripts/build.sh
fi

git add -A

if ! git diff --cached --quiet; then
  git commit -m "$COMMIT_MSG"
else
  echo "No staged changes to commit."
fi

CURRENT_BRANCH="$(git branch --show-current || true)"
if [[ -z "$CURRENT_BRANCH" ]]; then
  CURRENT_BRANCH="main"
  git checkout -B "$CURRENT_BRANCH"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Remote 'origin' is not configured." >&2
  echo "Usage: ./Scripts/publish-to-github.sh \"commit message\" \"https://github.com/<user>/<repo>.git\"" >&2
  exit 1
fi

git push -u origin "$CURRENT_BRANCH"
echo "Published to origin/$CURRENT_BRANCH"
