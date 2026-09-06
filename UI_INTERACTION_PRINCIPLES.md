# UI Interaction Principles

Paper Reader の UI は、読書の流れを止めないことを最優先する。

> 読書中のコンテキストを維持したまま、必要な情報や操作だけをその場に一時的に表示する。

新しい UI を足す前に、必ず「この操作のために別画面へ移動する必要があるか？」を確認する。必要がなければ現在位置を維持する。

## Surface の使い分け

| Surface | 使うとき | 例 |
|---|---|---|
| **Popover** | 今触っている対象に紐づく局所操作 | メモ作成・確認・編集、引用 preview、用語、Workspace 追加先 |
| **Sheet / Overlay** | 少し大きい一時作業 | Export、図の拡大、詳細 preview |
| **Inspector** | 論文全体の一覧・管理 | Notes 一覧、用語集一覧 |
| **Modal** | 作業を止めないと進めない重大判断 | 取り消せない破壊操作 |
| **Route** | ユーザーが明確に場所を移るとき | Library / Reader / Workspace / Settings |

局所操作のために新 route を増やさない。通常の追加・編集・確認に modal を多用しない。本文上の操作で Inspector を勝手に開かない。

## 閉じたら元通り

Popover / Sheet / Overlay を閉じたあと、次を極力保持する。

- Reader の scroll 位置と現在の段落
- Outline の開閉、右 Inspector の開閉
- 検索状態、開いている論文
- 可能なら選択と入力途中の内容

一時 UI を使ったことで読書位置を失わない。

## 判断順

1. 局所的な操作か → Popover
2. 一時的だが少し大きいか → Sheet / Overlay
3. 論文全体の一覧か → Inspector
4. 作業を止める必要があるか → Modal
5. 本当に別の場所へ行くか → Route

実装が簡単だからという理由で、別 route・大きな modal・右 sidebar の強制 open・外部アプリ起動を選ばない。

## 既にある体験は壊さない

原則を満たしている UI は作り直さない。

- Library 上の background import
- Import 中カードから Paper card への移行
- Export Dialog、図の lightbox、⌘F / ⌘K のスコープ分離
- Workspace 追加のカードメニュー picker

## メモ

作成・その場の確認・編集は本文上の Popover。Notes Inspector は論文全体のメモ一覧と、一覧から本文位置への移動だけに使う。

## 実装状況

- **済み（Phase 1）**: インラインメモ（作成 / 確認 / 編集 / 削除+Undo）。Notes は一覧専用
- **未達（Phase 2）**: 引用 preview、用語 popover
- **原則どおりのため変更しない**: Export、図の拡大、⌘F / ⌘K、Workspace 追加 picker、Library 上の PDF background import

詳細と優先順は [ROADMAP.md](./ROADMAP.md) の「3.0a UI 統一の残り」を見る。
