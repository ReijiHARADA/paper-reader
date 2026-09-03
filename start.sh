#!/bin/bash
# Paper Reader 一括起動スクリプト

# スクリプトのディレクトリに移動
cd "$(dirname "$0")"

echo "=== Paper Reader 起動中 ==="
echo ""

# 翻訳サーバー起動
echo "1. 翻訳サーバーを起動中..."
cd translation-server
source .venv/bin/activate
export PYTORCH_ENABLE_MPS_FALLBACK=1
python server.py &
MADLAD_PID=$!
cd ..
echo "   ✓ 翻訳サーバー起動 (PID: $MADLAD_PID)"
sleep 2

# Ollama起動
echo "2. Ollamaを起動中..."
ollama serve &
OLLAMA_PID=$!
echo "   ✓ Ollama起動 (PID: $OLLAMA_PID)"
sleep 2

# アプリ起動
echo "3. アプリを起動中..."
npm run dev &
APP_PID=$!
echo "   ✓ アプリ起動 (PID: $APP_PID)"
echo ""

echo "=== 起動完了 ==="
echo ""
echo "アクセス: http://localhost:5173"
echo ""
echo "プロセスID:"
echo "  - 翻訳サーバー: $MADLAD_PID"
echo "  - Ollama: $OLLAMA_PID"
echo "  - アプリ: $APP_PID"
echo ""
echo "終了する場合:"
echo "  kill $MADLAD_PID $OLLAMA_PID $APP_PID"
echo ""
echo "または Ctrl+C で全プロセスを終了"
echo ""

# Ctrl+Cで全プロセス終了
trap "echo ''; echo '終了中...'; kill $MADLAD_PID $OLLAMA_PID $APP_PID 2>/dev/null; exit" EXIT INT TERM

# 待機
wait
