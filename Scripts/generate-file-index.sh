#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WATCH_MODE="${WATCH_MODE:-0}"
POSITIONAL=()

for arg in "$@"; do
  case "$arg" in
    --watch)
      WATCH_MODE=1
      ;;
    *)
      POSITIONAL+=("$arg")
      ;;
  esac
done

SOURCE_FOLDER="${POSITIONAL[0]:-$SCRIPT_DIR/../Files}"
OUTPUT_FILE="${POSITIONAL[1]:-$SCRIPT_DIR/../Assets/JS/files-data.js}"

if [[ ! -d "$SOURCE_FOLDER" ]]; then
  echo "Source folder not found: $SOURCE_FOLDER" >&2
  exit 1
fi

abs_path() {
  local target="$1"
  if command -v realpath >/dev/null 2>&1; then
    realpath "$target"
  else
    (cd "$target" && pwd)
  fi
}

json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//"/\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

file_size() {
  local path="$1"
  if stat -f %z "$path" >/dev/null 2>&1; then
    stat -f %z "$path"
  else
    stat -c %s "$path"
  fi
}

file_mtime_epoch() {
  local path="$1"
  if stat -f %m "$path" >/dev/null 2>&1; then
    stat -f %m "$path"
  else
    stat -c %Y "$path"
  fi
}

iso_utc_from_epoch() {
  local epoch="$1"
  if date -u -r "$epoch" +"%Y-%m-%dT%H:%M:%SZ" >/dev/null 2>&1; then
    date -u -r "$epoch" +"%Y-%m-%dT%H:%M:%SZ"
  else
    date -u -d "@$epoch" +"%Y-%m-%dT%H:%M:%SZ"
  fi
}

generate_index() {
  local source_abs output_abs
  source_abs="$(abs_path "$SOURCE_FOLDER")"
  output_abs="$OUTPUT_FILE"

  local tmp
  tmp="$(mktemp)"

  {
    printf 'window.__FILE_INDEX__ = ['

    local count=0
    while IFS= read -r path; do
      [[ -z "$path" ]] && continue

      local rel
      rel="${path#"$source_abs"/}"
      rel="${rel//\\//}"

      local type size epoch modified
      if [[ -d "$path" ]]; then
        type="directory"
        size=0
      else
        type="file"
        size="$(file_size "$path")"
      fi

      epoch="$(file_mtime_epoch "$path")"
      modified="$(iso_utc_from_epoch "$epoch")"

      if [[ $count -gt 0 ]]; then
        printf ','
      fi

      printf '\n  {"path":"%s","type":"%s","size":%s,"modified":"%s"}' \
        "$(json_escape "$rel")" \
        "$type" \
        "$size" \
        "$(json_escape "$modified")"

      count=$((count + 1))
    done < <(find "$source_abs" -mindepth 1 -print | LC_ALL=C sort)

    if [[ $count -gt 0 ]]; then
      printf '\n'
    fi

    printf '];\n'
  } > "$tmp"

  mv "$tmp" "$output_abs"
  echo "Wrote index to $output_abs"
}

watch_with_inotify() {
  generate_index
  echo "Watching '$SOURCE_FOLDER' with inotifywait. Press Ctrl+C to stop."
  while inotifywait -qq -r -e create -e delete -e modify -e move "$SOURCE_FOLDER"; do
    generate_index
  done
}

watch_with_fswatch() {
  generate_index
  echo "Watching '$SOURCE_FOLDER' with fswatch. Press Ctrl+C to stop."
  fswatch -o "$SOURCE_FOLDER" | while read -r _; do
    generate_index
  done
}

watch_with_polling() {
  echo "No inotifywait/fswatch found. Polling every 2 seconds. Press Ctrl+C to stop."
  while true; do
    generate_index
    sleep 2
  done
}

if [[ "$WATCH_MODE" == "1" ]]; then
  if command -v inotifywait >/dev/null 2>&1; then
    watch_with_inotify
  elif command -v fswatch >/dev/null 2>&1; then
    watch_with_fswatch
  else
    watch_with_polling
  fi
else
  generate_index
fi
