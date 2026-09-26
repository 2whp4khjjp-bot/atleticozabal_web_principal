#!/usr/bin/env bash
set -euo pipefail

generated_files="$(git diff-tree --no-commit-id --name-only -r HEAD | sed '/^$/d')"

resolve_generated_conflicts() {
  local conflicts file unresolved=0
  conflicts="$(git diff --name-only --diff-filter=U)"
  [ -n "$conflicts" ] || return 1

  while IFS= read -r file; do
    case "$file" in
      data/*.json|calendario-*.ics)
        if printf '%s\n' "$generated_files" | grep -Fqx "$file"; then
          echo "Se conserva la versión recién generada de $file"
          git checkout --theirs -- "$file"
          git add "$file"
        else
          unresolved=1
        fi
        ;;
      *)
        unresolved=1
        ;;
    esac
  done <<< "$conflicts"

  [ "$unresolved" -eq 0 ] || return 1
  GIT_EDITOR=true git rebase --continue
}

for attempt in 1 2 3; do
  echo "Publicación del calendario: intento ${attempt}/3"
  if ! git pull --rebase origin main; then
    if ! resolve_generated_conflicts; then
      git rebase --abort 2>/dev/null || true
      echo "Conflicto no automático al publicar el calendario" >&2
      exit 1
    fi
  fi
  if git push origin HEAD:main; then
    exit 0
  fi
  sleep $((attempt * 5))
done

echo "No se pudo publicar el calendario después de 3 intentos" >&2
exit 1
