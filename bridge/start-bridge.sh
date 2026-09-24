#!/usr/bin/env bash
set -euo pipefail

if [[ "${HERDR_ENV:-}" != "1" ]]; then
  echo 'Abre este script desde un panel administrado por Herdr.' >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
env_file="${XDG_CONFIG_HOME:-$HOME/.config}/hermes-herdr-bridge/bridge.env"

if [[ ! -r "$env_file" ]]; then
  echo "Falta el archivo privado $env_file." >&2
  exit 1
fi

set -a
source "$env_file"
set +a

exec node "$script_dir/src/server.js" --config "$script_dir/config.json"
