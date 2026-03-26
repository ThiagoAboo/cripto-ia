#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Uso: bash scripts/apply-cumulative-package.sh /caminho/para/cripto-ia" >&2
  exit 1
fi

TARGET=$(cd "$1" && pwd)
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PACKAGE_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
PATCH_DIR="$PACKAGE_ROOT/patch"

if [ ! -d "$TARGET" ]; then
  echo "Alvo inexistente: $TARGET" >&2
  exit 1
fi

if [ ! -d "$PATCH_DIR" ]; then
  echo "Pasta patch/ não encontrada ao lado do script." >&2
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$TARGET/.backup-etapa34-$STAMP"
mkdir -p "$BACKUP_DIR"

echo "Criando backup em: $BACKUP_DIR"
while IFS= read -r -d '' file; do
  rel=${file#"$PATCH_DIR/"}
  if [ -f "$TARGET/$rel" ]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    cp "$TARGET/$rel" "$BACKUP_DIR/$rel"
  fi
  mkdir -p "$TARGET/$(dirname "$rel")"
  cp "$file" "$TARGET/$rel"
done < <(find "$PATCH_DIR" -type f -print0)

echo "Aplicação concluída."
echo "Próximos passos:"
echo "  1) bash scripts/check-cumulative-package.sh $TARGET"
echo "  2) bash scripts/run-post-merge-smoke.sh $TARGET"
