#!/usr/bin/env bash
set -euo pipefail

# Herdr puede abrir paneles con un PATH mínimo. Las herramientas instaladas por
# el usuario (Herdr, Node y Codex) viven aquí en ambos nodos Linux.
export PATH="$HOME/.local/bin:$PATH"

if [[ "${HERDR_ENV:-}" != "1" || -z "${HERDR_PANE_ID:-}" ]]; then
  echo 'Ejecuta este script desde un panel administrado por Herdr.' >&2
  exit 1
fi

script_dir=$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")

# La publicación es persistente y sólo expone el bridge local por Tailscale.
# Es idempotente; volver a ejecutarla tras reiniciar el equipo evita depender
# de recordar un segundo comando.
if ! tailscale serve --bg --yes 8787; then
  echo 'No se pudo publicar el bridge con Tailscale Serve.' >&2
  echo 'Comprueba que Tailscale esté conectado: tailscale status' >&2
  exit 1
fi

new_pane() {
  local direction=$1
  local command=$2
  local pane_id
  pane_id=$(herdr pane split --current --direction "$direction" --cwd "$script_dir" --no-focus | \
    node -e 'let data="";process.stdin.on("data",chunk=>data+=chunk);process.stdin.on("end",()=>{const pane=JSON.parse(data).result?.pane?.pane_id;if(!pane)process.exit(1);console.log(pane)})')
  if [[ -z "$pane_id" ]]; then
    echo 'Herdr no devolvió el identificador del nuevo panel.' >&2
    return 1
  fi
  herdr pane run "$pane_id" "$command" >/dev/null
  printf '%s\n' "$pane_id"
}

bridge_pane=$(new_pane right "cd '$script_dir' && exec ./start-bridge.sh")
hermes_pane=$(new_pane down "cd '$script_dir' && exec ./open-hermes.sh")
printf 'Bridge iniciado en %s; CLI de Hermes iniciado en %s.\n' "$bridge_pane" "$hermes_pane"
