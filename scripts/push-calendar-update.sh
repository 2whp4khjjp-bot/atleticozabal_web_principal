#!/usr/bin/env bash
set -euo pipefail

for attempt in 1 2 3; do
  echo "Publicación del calendario: intento ${attempt}/3"
  git pull --rebase origin main
  if git push origin HEAD:main; then
    exit 0
  fi
  sleep $((attempt * 5))
done

echo "No se pudo publicar el calendario después de 3 intentos" >&2
exit 1
