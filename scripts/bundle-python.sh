#!/bin/bash
# translation-server の .venv を src-tauri/resources/ にコピーして
# Tauri ビルド時にバンドルできる形に整える
# 使い方: npm run tauri:build の前に実行する（または beforeBuildCommand に追加）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_VENV="$PROJECT_DIR/translation-server/.venv"
DEST_DIR="$PROJECT_DIR/translation-server/venv"

echo "=== Python venv バンドル ==="
echo "コピー元: $SRC_VENV"
echo "コピー先: $DEST_DIR"

if [ ! -d "$SRC_VENV" ]; then
  echo "エラー: .venv が見つかりません。translation-server セットアップ済みか確認してください。"
  exit 1
fi

# 既存の venv/ を削除して作り直す
rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"

# シンボリックリンクを実体にしてコピー（.app 内で動くように）
cp -RL "$SRC_VENV/." "$DEST_DIR/"

# 不要なキャッシュ等を削除してサイズ削減
find "$DEST_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$DEST_DIR" -name "*.pyc" -delete 2>/dev/null || true
find "$DEST_DIR" -name "*.pyo" -delete 2>/dev/null || true

echo "✓ バンドル完了: $(du -sh "$DEST_DIR" | cut -f1)"
