# Third-party notices

Paper Reader 本体のソースコードは [MIT License](./LICENSE) です。

このライセンスは **Paper Reader のソースコードにだけ** 適用されます。翻訳に使う MADLAD-400 のモデル重み、PyTorch、pdf.js、その他の依存ライブラリ／同梱バイナリには、それぞれのライセンスが適用されます。Paper Reader が MIT だからといって、それらまで MIT になるわけではありません。

以下は、配布物または実行時に直接使う主要な第三者コンポーネントです。記載は **package metadata / 同梱 LICENSE / モデルカード** から確認できた範囲です。確認できなかった項目は「要確認」と書いてあります。

## モデル

| コンポーネント | 版 / 識別子 | ライセンス（確認源） |
|---|---|---|
| MADLAD-400 3B MT モデル重み | `google/madlad400-3b-mt` | Apache-2.0（Hugging Face モデルカード `license: apache-2.0` および本文 "License: Apache 2.0"） |

モデル重みの利用条件は Paper Reader の MIT とは別です。再配布する場合は Apache-2.0 の表示義務に従ってください。

## 翻訳サーバー（Python、`.app` に venv 同梱）

確認場所: `translation-server/.venv` 内の dist-info / LICENSE ファイル。

| コンポーネント | 確認した版 | ライセンス（確認源） |
|---|---|---|
| PyTorch | 2.14.0 | BSD-3-Clause 相当（`torch-2.14.0.dist-info/licenses/LICENSE` の再配布条項） |
| Transformers | 5.16.1 | Apache 2.0（`METADATA` の `License: Apache 2.0 License`） |
| Hugging Face Hub | 1.29.0 | Apache-2.0（`METADATA`） |
| Safetensors | 0.8.0 | Apache License 2.0（`safetensors-0.8.0.dist-info/licenses/LICENSE`） |
| Accelerate | 1.14.0 | Apache（`METADATA` の `License: Apache`） |
| FastAPI | 0.141.1 | MIT（`fastapi-0.141.1.dist-info/licenses/LICENSE`） |
| Uvicorn | 0.52.4 | BSD-3-Clause（`uvicorn-0.52.4.dist-info/licenses/LICENSE.md`） |
| NumPy | 2.5.2 | BSD-3-Clause（`numpy-2.5.2.dist-info/licenses/LICENSE.txt`） |
| SentencePiece | 0.2.2 | 要確認（インストール済み dist-info に LICENSE ファイルが無かった） |

## フロントエンド（npm）

確認場所: `node_modules/<pkg>/package.json` の `license` および同梱 LICENSE。

| コンポーネント | ライセンス（確認源） |
|---|---|
| React / react-dom | MIT（`package.json` および `LICENSE`） |
| react-router-dom | MIT（`package.json`、`react-router/LICENSE.md`） |
| pdf.js (`pdfjs-dist` 3.11) | Apache-2.0（`package.json` および `LICENSE`） |
| idb | ISC（`package.json` および `LICENSE`） |
| lucide-react | ISC（`package.json` および `LICENSE`） |
| uuid | MIT（`package.json` および `LICENSE.md`） |
| zustand | MIT（`package.json` および `LICENSE`） |
| Vite（開発・ビルド） | MIT（`package.json`） |

## デスクトップシェル

| コンポーネント | ライセンス（確認源） |
|---|---|
| Tauri 2 (`@tauri-apps/api`) | Apache-2.0 OR MIT（`package.json`。同梱 `LICENSE_MIT` / `LICENSE_APACHE-2.0`） |

## Ollama

Paper Reader は用語集のために **任意** でローカルの Ollama HTTP API（既定 `http://localhost:11434`）へ接続します。Ollama 本体もそのモデル重みもこのリポジトリには同梱していません。Ollama を使う場合は、Ollama および読み込むモデルそれぞれのライセンスが別途適用されます。

## その他

翻訳サーバー venv には上記以外の推移的依存もあります。完全な一覧は `translation-server/.venv` と `package-lock.json` を参照してください。個々の LICENSE ファイルがここに無いパッケージは、再配布前に dist-info を確認してください。
