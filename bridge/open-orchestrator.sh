#!/usr/bin/env bash
set -euo pipefail

if [[ "${HERDR_ENV:-}" != "1" ]]; then
  echo 'Ejecuta este script desde un panel administrado por Herdr.' >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

new_pane() {
  local direction=$1
  local command=$2
  local pane_id
  pane_id=$(herdr pane split --current --direction "$direction" --cwd "$script_dir" --no-focus | \
    node -e 'let data="";process.stdin.on("data",chunk=>data+=chunk);process.stdin.on("end",()=>console.log(JSON.parse(data).result.pane.pane_id))')
  herdr pane run "$pane_id" "$command" >/dev/null
  printf '%s\n' "$pane_id"
}

bridge_pane=$(new_pane right "cd '$script_dir' && exec ./start-bridge.sh")
hermes_pane=$(new_pane down "cd '$script_dir' && exec ./open-hermes.sh")
printf 'Bridge iniciado en %s; CLI de Hermes iniciado en %s.\n' "$bridge_pane" "$hermes_pane"
