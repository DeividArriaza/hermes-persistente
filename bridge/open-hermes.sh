#!/usr/bin/env bash
set -euo pipefail

session_name=${1:-control}
if [[ ! "$session_name" =~ ^[A-Za-z0-9_-]{1,48}$ ]]; then
  echo 'El nombre de sesión sólo admite letras, números, guiones y guiones bajos.' >&2
  exit 1
fi

exec ssh -tt \
  -i "$HOME/.ssh/id_ed25519_hermes_contabo" \
  -o IdentitiesOnly=yes \
  deiv@hermes-contabo \
  "cd /home/deiv/hermes-persistente && docker compose exec -it -u 1001:1001 hermes /opt/hermes/.venv/bin/hermes chat --tui -s orquestar-herdr --continue $session_name --create-if-missing"
