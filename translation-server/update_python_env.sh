#!/bin/bash
# Python環境更新スクリプト
# Homebrew Python は使わない。
# macOS 26 では Homebrew python@3.12 の platform.mac_ver() が空になり、
# python -m venv / ensurepip / uv がすべて失敗する。
# uv が配布するスタンドアロン CPython 3.12 を使う。

set -e

echo "========================================="
echo "Python環境更新（MPS対応）"
echo "========================================="
echo ""

cd "$(dirname "$0")"

if ! command -v uv &> /dev/null; then
    echo "uvをインストール中..."
    if command -v brew &> /dev/null; then
        brew install uv
    else
        curl -LsSf https://astral.sh/uv/install.sh | sh
    fi
else
    echo "✓ uv インストール済み"
fi

echo ""
echo "uv管理の Python 3.12 を用意中..."
echo "（Homebrew python@3.12 は macOS 26 で mac_ver が空になるため使わない）"
uv python install 3.12
echo "✓ $(uv python find 3.12) --version: $($(uv python find 3.12) --version)"

if [ -d ".venv" ]; then
    echo ""
    echo "既存の .venv をバックアップ中..."
    BACKUP_DIR=".venv.backup.$(date +%Y%m%d_%H%M%S)"
    mv .venv "$BACKUP_DIR"
    echo "✓ バックアップ: $BACKUP_DIR"
fi

echo ""
echo "Python 3.12 で仮想環境を作成中（uv venv）..."
uv venv --python 3.12 .venv
echo "✓ 仮想環境作成完了"

source .venv/bin/activate

echo ""
echo "依存関係をインストール中..."
uv pip install -r requirements.txt

echo ""
echo "========================================="
echo "インストール確認"
echo "========================================="
python -c "
import sys
import platform
import torch
import transformers

print(f'Python: {sys.version.split()[0]}')
print(f'Executable: {sys.executable}')
print(f'Architecture: {platform.machine()}')
print(f'mac_ver: {platform.mac_ver()[0]!r}')
print(f'PyTorch: {torch.__version__}')
print(f'Transformers: {transformers.__version__}')
print(f'MPS built: {torch.backends.mps.is_built()}')
print(f'MPS available: {torch.backends.mps.is_available()}')
x = torch.ones(4, device='mps') if torch.backends.mps.is_available() else None
print(f'MPS tensor ok: {x is not None}')
"

echo ""
echo "========================================="
echo "✓ 環境更新完了"
echo "========================================="
echo ""
echo "次のステップ:"
echo "  cd translation-server"
echo "  source .venv/bin/activate"
echo "  python benchmark_cpu_baseline.py"
echo "  PYTORCH_ENABLE_MPS_FALLBACK=1 python test_mps_stages.py"
echo ""
