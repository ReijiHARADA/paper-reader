# 学術 PDF 構造抽出の調査と PoC

対象: Paper Reader（`projects/paper-reader`）  
日付: 2026-09-05  
ブランチ: `main`（`3ebd33c` 時点の現行 parser を壊さず、import 経路の外で調査）

方針は二択にしない。

- Generic Extraction（現行 `pdfLayout.ts` / `structureService.ts`）
- Format-specific Profile（既知フォーマットだけ補正）
- Academic / Layout Parser（GROBID / Docling 等、low-confidence 時だけ）
- Confidence / Evidence Fusion

未知フォーマットでは Generic だけで破綻しない。既知フォーマットでは format-specific knowledge を使う。Production parser の置き換えは行っていない。

---

## 1. 最新版 Paper Reader の現行 parser 分析

入口は `importServiceV2.ts`。流れは次のとおり。

1. `pdfjsRuntime.ts` が **pdfjs-dist 3.11 legacy** を開き、CMap（`cMapUrl` + `cMapPacked`）で日本語 CID をデコードする。**6.x には上げない。**
2. `pdfService.ts` が text item（文字列, bbox, fontSize, fontName, page）と PDF metadata（Title / Author）、埋め込み画像を取る。
3. `ocrService.ts` の `isScannedPdf` が「全ページ平均 text item 数 < 10」なら Apple Vision OCR で text items を上書きする。コメントは「平均 10 文字」だが、実装は item 数。
4. `structureService.ts` が `pdfLayout.reconstructDocument` の role 付きブロックを `Paper` / `Section` / `PaperBlock` にする。
5. `extractionConfidence.ts` が column / readingOrder / unicode / paragraph の平均スコアを `PaperBlock.extractionConfidence` と diagnostics に載せる。
6. 日本語論文（本文の日本語比率）は翻訳せず表示する。

`src/types/paper.ts` の現状ギャップ:

- `authors: string[]` のみ。所属と著者↔所属 relation が無い。
- `Section.parentSectionId` はあるが、`structureService` は常に `null`。level は番号／フォント比から推定しているだけ。
- Evidence source（なぜ title か）は保持していない。

残すべき baseline（壊してはいけないもの）:

- pdf.js 3.11 + CMap
- Apple Vision OCR
- 日本語非翻訳、日本語 heading / 図・表キャプション
- 1-column / 2-column reconstruction（`orderPageLines` の左→右）
- 埋め込み画像 → 最大重なりキャプションへ 1 対 1
- `extractionConfidence`
- real-paper regression（`test-fixtures/` + `test-data/real-papers/`）

---

## 2. 現行 heuristic 一覧

`pdfLayout.ts` を中心に、現行ルールは次の群に分かれる。

### 幾何・読み順

| ルール | 実装の要点 |
|---|---|
| 列検出 | 本文幅比 0.25–0.55 の行クラスタ。gutter は中央付近 |
| spanning | 幅 ≥ pageWidth × 0.48 |
| 読み順 | spanning top → left 全部 → right 全部 → spanning bottom。途中の full-width でカット |
| 1 ページ目マストヘッド | Abstract / Introduction / `1 はじめに` より上を別 order |
| header/footer | `HEADER_Y = 48`、`FOOTER_MARGIN = 38`、pageHeight × 0.08、繰り返し文字列 |
| ページ番号 | 1–3 桁の単独行 |

絶対座標（`HEADER_Y = 48`）は残るが、新規ルールでは使わない。

### 役割分類

| role | 判定 |
|---|---|
| title | 1 ページ目、font ≥ body × 1.28 かつそのページの最大付近 |
| author | マストヘッド内の person-name / Latin author line / email |
| affiliation | university / 大学 等の lexicon、紙面コード `J-040` |
| heading | NAMED_HEADINGS、番号付き節、ALL-CAPS、font-size 比 |
| paragraph | 上記以外の本文行を結合 |
| figure_caption | `Figure` / `Fig.` / `図 n` |
| table_caption | `Table` / `表 n` |
| equation | 数学記号密度。ハイフン英文・URL は除外 |
| footnote | ページ下部 30%、小さいフォント、`*` `†` `[1]` |
| copyright | `permission to make digital or hard copies` |

### 図

- `figureImageRect`: キャプション上の列バンドを crop
- `assignRectsToRegions`: 埋め込み画像を最大重なりのキャプションへ 1 対 1

### 構造化（`structureService.ts`）

- 著者行を CJK 2 トークン組 + Latin 残りに分解
- 見出し level は `1` / `1.1` / `1.1.1` または font 比
- 所属ブロックはリーダー本文に出さない
- `parentSectionId` 未配線

### 信頼度（`extractionConfidence.ts`）

- columnConfidence / readingOrderConfidence / unicodeConfidence / paragraphConfidence
- 低信頼は元 PDF 誘導。Evidence source は無い

---

## 3. Generic heuristic と venue-specific heuristic の分類

### Generic（残す。Layer B）

- 列・spanning・読み順
- タイトルの font ratio
- マストヘッド終端（Abstract / はじめに）
- 番号付き見出し、日本語節番号、参考文献
- Figure / 図 / Table / 表
- 埋め込み画像 1 対 1
- 数式・脚注の粗い検出
- CJK 著者トークン
- unicode / 列の confidence
- scanned: 平均 item < 10

### Format-specific（`pdfLayout.ts` / `quality.ts` に散在。Profile へ移す）

| 現行の場所 | 内容 | 移す先 |
|---|---|---|
| `isEdgeChrome` | TEI/CHI/UIST/ISWC/CSCW/IMWUT 年号ヘッダー | ACM profile boilerplate |
| `isCopyright` / quality | ACM permission boilerplate | ACM hard rule |
| `NAMED_HEADINGS` / quality | CCS Concepts, ACM Classification Keywords, Author Keywords | ACM hard rule（本文見出しにしない） |
| quality | Index Terms | IEEE hard rule |
| `looksLikeSubjectClassification` | CCS 1998 コード / CCS 2012 ツリー | ACM hard + generic の弱フォールバック |
| quality タイトルゴミ | “Proceedings of CHI …” | ACM / IEEE boilerplate |

Generic 側に残してよい弱い形: 「短い ALL-CAPS の会議ヘッダーは chrome」。会議名の列挙は Profile 側。

今回 **pdfLayout.ts からルールを削除してはいない。** Profile 側に同等の宣言を置き、将来の移動先を固定した。

---

## 4. 現在の失敗パターン

実測とコードから見えるもの。

1. **単一巨大 heuristic。** 壊れた PDF のたびに `pdfLayout.ts` へ if を足す構造。
2. **著者↔所属が relation ではない。** 2×2 affiliation grid は連結され、mapping が無い。
3. **subsection hierarchy が未配線。** level は出るが parent が常に null。
4. **絶対座標 header。** template 余白差に弱い。
5. **マストヘッドが Latin 前提だった**（日本語は部分修正済み）。未知テンプレでは `mastheadEndY = -1` になり副題が見出し化する。
6. **タイトルが PDF metadata や GROBID と融合されない。** font 最大行だけ。
7. **図は「画像→最大重なり」のみ。** キャプション隣接の空領域提案が無い。
8. **表はキャプション検出まで。** table bbox / cell は無い（今回 cell は Production 対象外）。
9. **OCR 判定が item 数だけ。** garbled CID（CMap 前）や mixed page を見ない。
10. **confidence が「なぜ」を持たない。**
11. **コーパスが wearables / HCI 偏り。** ACM acmart に過学習しやすい。
12. **IEEE 1998 など古いテンプレ**は現行でもタイトルは取れるが、Index Terms が無く Profile も発火しない（これは正しい。無理に IEEE を当てない）。

ベンチマークで観測した具体例:

| 論文 | 現象 |
|---|---|
| fashion-hybrid-cmf | title role が null（最大フォントが閾値未満、またはメタデータ優先が無い） |
| step-to-charge | タイトルに arXiv 副題が連結され catalog タイトルと exact match しない |
| dont-mind-me | タイトルがハイフンで途切れる（`On-`） |
| design-for-wearability | IEEE だが 1998 テンプレのため IEEE profile は 0.08。Generic でタイトルは正解 |
| thermal-earring / ppg-earring | catalog は acm-acmart だが検出スコア 0.60 / 0.26 → **正しく generic** |

---

## 5. GROBID 調査

役割: **Academic Semantic Parser**（title / author / affiliation / mapping / abstract / section / references / citations）。Visual layout の主担当ではない。

| 項目 | 内容 |
|---|---|
| 出力 | TEI XML。`processHeaderDocument` / `processFulltextDocument` / `processReferences` |
| 座標 | TEI に座標を載せられる（fulltext）。header だけでも著者・所属 relation が取れる |
| ライセンス | Apache 2.0 |
| 実行 | ローカル JVM または Docker。**クラウド GROBID に PDF を送らない** |
| Apple Silicon | CRF イメージは arm64 あり（0.8.1+）。full/DL は amd64 エミュレーションになりやすい。`--init` と RAM 確保が必要 |
| メモリ | header だけならコンテナ 2GB 程度。fulltext は 4GB+。full+DL は 8–14GB 級で MADLAD 同居は厳しい |
| 統合難度 | 中。サイドカーとして任意。常時 RAM 常駐はしない |

Paper Reader での位置づけ: **ヘッダ metadata と参考文献の Evidence。** 本文文字列は使わない（native pdf.js 優先）。

本環境: Docker も Java も無し。ライブ GROBID は未実行。TEI パーサと `GROBID_URL` 任意クライアント（クラウド URL 拒否）だけを PoC した。

---

## 6. MinerU 調査

役割: **Visual Layout Parser**（layout / heading / figure / table / caption / formula / reading order / OCR）。

| 項目 | 内容 |
|---|---|
| 強み | 数式 LaTeX、表、多カラム、図表 |
| バックエンド | pipeline（検出モデル群）と VLM（MinerU2.5 系）。Apple は MLX 言及あり |
| RAM | pipeline でも 16GB 級が現実的。VLM はさらに重い |
| モデルサイズ | VLM 1.2B でも常駐は MADLAD 3B と競合する |
| ライセンス | 2026 に AGPL から MinerU Open Source License（Apache 2.0 ベース + 大規模商用制限 + サービス時 attribution）。配布アプリには法務確認が必要 |
| 統合難度 | 高。Python 重量、モデル取得、常駐コスト |

**Production 同梱はしない。** 巨大 VLM 常駐は M4 24GB + MADLAD の前提と衝突する。

---

## 7. Docling 調査

役割: MinerU と同じく Visual Layout Parser 候補。IBM / Linux Foundation、**MIT**。

| 項目 | 内容 |
|---|---|
| 強み | born-digital は native text を保持しやすい。表（TableFormer）。typed `DoclingDocument` |
| reading order | layout モデル（RT-DETR / DocLayNet 系） |
| Apple Silicon | CPU でも動く。MLX / MPS 言及あり。MinerU VLM より起動が軽い |
| モデル | コード MIT、個別モデルは別ライセンス（確認してから同梱） |
| 数式 | MinerU より弱い、という比較が多い |
| 統合難度 | 中。Python 依存だが MinerU より配布向き |

**次の layout PoC は Docling を先にする。** 理由: ライセンス、RAM、native text との相性、MADLAD 同居。数式が弱点なら、そのページだけ後段に回す。

ライブ Docling も本環境では未実行（重量モデルをこのターンで入れない）。代わりに「visual bbox → native pdf.js 文字列を割当」のユニットを実装した。

---

## 8. pdffigures2 調査

Clark & Divvala, JCDL 2016。依存はしない。考え方だけ借りる。

アルゴリズム:

1. キャプション行をキーワードで検出。同一番号の重複は一貫性で偽陽性を落とす。
2. グラフィック領域と本文 chunk を取る。
3. 本文を BodyText / Other に分類。BodyText は図に含めない。
4. 各キャプションについて、隣接 4 方向の proposal を伸ばす。本文・余白・他キャプションと交差させない。列を跨がない（spanning caption 以外）。
5. proposal をスコアし、重複しない割当（permutation）を選ぶ。

Paper Reader への適用:

- 現行の「埋め込み画像 → 最大重なり 1 対 1」は **baseline として残す**。
- 画像が無い／小さいときは、キャプション上の crop（現行 `figureImageRect`）に加え、左右 proposal と competing caption ペナルティをスコア化する。
- `CAPTION_OF` relation を明示する。

---

## 9. Table parsing 調査

Table Transformer / PubTables-1M は **detection** と **structure recognition** を別モデルにしている。

- Detection: ページ画像から table bbox。
- Structure: その crop から行・列・セル。テキストは PDF native / OCR を後でセルへ割当。

今回 **cell-level は Production に入れない。** 設計だけ分ける。

Paper Reader の段階:

1. 今: table caption 検出 + 可能なら周辺 crop 画像。
2. 次: table bbox detection（caption との `CAPTION_OF`）。
3. その後: structure recognition は cascade のさらに後ろ。

---

## 10. 比較表

評価は Paper Reader 用途（学術 PDF、ローカル、M4 24GB、native text 優先）。◎ / ○ / △ / × は「その役割での適性」。

| 項目 | Paper Reader baseline (pdf.js + heuristic) | GROBID | MinerU | Docling | pdffigures2 |
|---|---|---|---|---|---|
| Primary role | Native text + generic layout | Academic semantic | Visual layout | Visual layout | Figure/caption |
| Title | ○ | ◎ | ○ | ○ | × |
| Author | △ | ◎ | △ | △ | × |
| Affiliation | △ | ◎ | △ | △ | × |
| Author–Affiliation | × | ◎ | × | × | × |
| Heading | ○ | ○ | ◎ | ◎ | △ |
| Paragraph | ◎ native | ○ | ○（生成しがち） | ○ native 寄り | × |
| Reading order | ○ 2 段組 | △ | ◎ | ◎ | × |
| Figure | ○ 画像 1:1 | × | ◎ | ○ | ◎ |
| Caption | ○ | △ | ◎ | ◎ | ◎ |
| Table | △ caption のみ | △ | ◎ | ◎ | ○ region |
| Formula | △ 行 heuristic | × | ◎ | △ | × |
| References | △ 見出し | ◎ | △ | △ | × |
| OCR | Vision fallback | × | ◎ | ○ | × |
| Coordinates | ◎ pdf.js | ○ TEI | ◎ | ◎ | ◎ |
| Apple Silicon | ◎ | △ CRF Docker | △ 重い | ○ | △ JVM |
| RAM | 低 | 2–8GB | 16GB+ | 中 | 中 |
| Model size | なし | CRF 小 / DL 大 | 大 | 中 | なし |
| Speed | 速い | header は可 | 遅い | 中 | 中 |
| License | MIT + pdf.js | Apache 2.0 | カスタム（要確認） | MIT（モデル別） | Apache 2.0 |
| Integration difficulty | 既存 | 中（任意 sidecar） | 高 | 中 | 低（アルゴ移植） |

---

## 11. Format Profile 設計

実装: `src/services/pdfExtraction/formats/`（**importServiceV2 からは未接続**）。

```ts
type FormatProfile = {
  id: string;
  detect(document: DocumentEvidence): number; // 0.0–1.0
  hardRules: string[];
  scoreAdjustments: string[];
  firstPageRules: string[];
  headingRules: string[];
  boilerplateRules: string[];
};
```

今回の対象:

- `generic` — 常に fallback。detect は 0（選択には使わない）
- `acm` — acmart / SIGCONF 系
- `ieee` — conference 系

Springer LNCS / J-STAGE はコーパスに失敗 PDF が揃ってから足す。1 本のための rule は禁止。

Hard rule: CCS、ACM Reference Format、permission boilerplate、Index Terms、IEEE licensed-use footer。  
Soft evidence: title 位置、author 候補、列構造、masthead。DOI や publisher 名だけでは決めない。

絶対座標は Profile にも書かない。page 幅比、body font ratio、列幾何、相対余白。

---

## 12. Format detection 設計

`detectFormat`:

- 各 selectable profile の `detect()` を取る
- 適用条件: `best >= 0.75` かつ `best - second >= 0.12`
- それ以外は **generic のみ**

信号（複数必須）:

- DOI prefix（`10.1145` / `10.1109`）は **加点だけ**
- CCS / Index Terms / copyright 文言
- 会議名ヘッダー
- 1 ページ目 2 段組
- フッター

catalog の `formatFamily` は **Ground Truth**。Production 判定に使わない。PoC の detector も catalog を読まない。

実測:

| 論文 | catalog | ACM | IEEE | 適用 |
|---|---|---|---|---|
| interactive-jewellery | acm-acmart | 0.90 | 0.08 | acm |
| power-over-skin | acm-acmart | 1.00 | 0.08 | acm |
| speechin | unknown | 0.88 | 0 | acm（PDF 信号。catalog 非使用） |
| thermal-earring | acm-acmart | 0.60 | 0 | generic |
| dont-mind-me | acm-acmart | 0.64 | 0.18 | generic |
| ppg-earring | acm-acmart | 0.26 | 0 | generic |
| design-for-wearability | ieee-conference | 0.08 | 0.08 | generic（1998 テンプレ） |
| significant-other | springer-journal | 0 | 0 | generic |
| step-to-charge | arxiv | 0 | 0 | generic |
| fashion-hybrid-cmf | kci | 0 | 0 | generic |

ACM=0.52 / IEEE=0.49 相当はユニットテストで generic になることを確認した。弱い ACM 論文を無理に ACM へ落とさない。

---

## 13. Evidence Fusion 設計

```ts
type EvidenceSource =
  | "pdf-native"
  | "generic-heuristic"
  | "format-profile"
  | "grobid"
  | "layout-model"
  | "ocr";
```

融合はラベルと候補選択に使う。**健全な native 文字列を GROBID / VLM / OCR 文で置換しない。**

例（title）:

1. native 候補（pdf.js 行）を列挙
2. GROBID / layout / profile が同じ正規化タイトルに投票したら confidence を上げる
3. GROBID だけが別文字列でも、native が空でなければ native を残す
4. native が空（scanned / garbled）のときだけ OCR / GROBID 文字列を採用

`fuseTitle` を PoC 実装済み。

Cascade（性能）:

1. Native + Generic +（確信度の高い Profile）で high → 終了
2. header 低信頼だけ GROBID（ローカル、任意）
3. layout / 図表 / 読み順が低信頼なページだけ Docling
4. scanned / garbled region だけ Vision OCR

---

## 14. Confidence 設計

現行 `extractionConfidence.ts` は残す。

将来（DB migration なし）:

- `PaperBlock.metadata.evidence: Evidence[]` を足す（metadata は既に `Record<string, unknown>`）
- 最終 score は現行 4 指標 + evidence 加重
- band: high ≥ 0.9 / medium ≥ 0.7 / low < 0.7 は維持

page / region class:

| kind | 本文のソース |
|---|---|
| native-text | pdf.js |
| scanned | Vision OCR |
| garbled | OCR fallback（U+FFFD、spaced glyph） |
| mixed | region 単位 |

baseline の item 平均 < 10 は残し、char count / U+FFFD / coverage を追加評価する `pageClass.ts` を PoC した。

---

## 15. Canonical Document / relations 案

```ts
READS_BEFORE
CAPTION_OF
AFFILIATED_WITH
CHILD_OF   // section hierarchy
```

ノード role: title, author, affiliation, abstract, heading, paragraph, figure, table, caption, equation, footnote, citation, reference, header, footer, copyright, page-number, other。

現行 `LayoutBlock[]` は Canonical への投影元。Production の IndexedDB schema は今は変えない。リーダーは当分 `Paper` / `Section` / `PaperBlock` のまま。

著者↔所属: superscript 番号・記号、近接、grid、email、GROBID relation を `AFFILIATED_WITH` の Evidence にする。2×2 grid は評価対象（GT はこれから）。

---

## 16. benchmark 拡張案

既存:

- 合成: `test-fixtures/`（japanese-conference 含む）
- 実論文: `test-data/real-papers/`（gitignore）。PDF は commit しない
- catalog: `test-fixtures/real-papers/catalog.json`

今回追加:

- catalog に `publisher` / `venue` / `formatFamily` / `templateVersion`（GT のみ）
- `coverageTargets`（ACM, IEEE, Springer, Elsevier, Nature, MDPI, J-STAGE, arXiv, 1/2/mixed column, Japanese, figure/table/math-heavy, complex affiliations, scanned, old PDF, thesis）
- 部分 GT: `test-fixtures/real-papers/ground-truth/*.json`
- runner: `npm run bench:pdf-extraction`

Metrics:

| 対象 | 指標 |
|---|---|
| Title | normalized exact match |
| Authors / Affiliation | precision / recall / F1 |
| Author–Affiliation | relation F1 |
| Heading | precision / recall（部分一致可） |
| Reading order | pairwise order accuracy |
| Figure/Table–Caption | relation accuracy |
| OCR 時本文 | CER / WER |

全文人手 annotation はしない。重要な block だけでよい。HCI 偏りを直すため、次に入れる PDF は Elsevier / Nature / MDPI / J-STAGE / scanned を優先する。

---

## 17. Apple Silicon 性能評価

ターゲット: **M4 / 24GB**。MADLAD-400 3B が同じ端末で約 8–10GB。

| 構成 | 判定 |
|---|---|
| pdf.js + Generic + Format Profile | 常時。現実的 |
| GROBID CRF header（必要時だけ起動） | 可。常駐しない |
| GROBID full + DL | MADLAD 同居は非推奨 |
| Docling（低信頼ページ） | 次候補。常駐しない |
| MinerU VLM 常駐 | 不可 |
| 巨大汎用 VLM | 不可 |

理想 cascade は「high confidence で終わる」。layout モデルは low のときだけ。

---

## 18. license / distribution 評価

Paper Reader 本体は MIT。同梱物は `THIRD_PARTY_NOTICES.md`。

| コンポーネント | 配布アプリに入れるか |
|---|---|
| pdf.js 3.11 | 既存。可 |
| GROBID | 任意ローカル。**.app には同梱しない**（Java/Docker） |
| Docling | 将来の任意。モデルライセンスを確認してから |
| MinerU | カスタム条項。同梱しない |
| クラウド parser | 禁止 |

PDF を OpenAI / Google / Anthropic / Adobe 等へ送る構成は採らない。

---

## 19. PoC 結果

Import pipeline は切り替えていない。コードは `src/services/pdfExtraction/`。

### A. 現行 parser benchmark

`npm run bench:pdf-extraction`（キャッシュ 10 PDF。wear-scale / precious-materials は未取得）。

- Title normalized exact: **8 / 10 = 0.80**
- interactive-jewellery: タイトル正解、見出し・Figure 2・page 3 の pairwise 読み順 すべて 1.0
- 失敗: step-to-charge（副題連結）、fashion-hybrid-cmf（title null）
- 既存 `npm test` の real-paper regression は全件パス

### B. Format detector / Profile

- ACM 複数信号で適用、DOI 単独では generic
- ACM と IEEE が拮抗したら generic
- 実 PDF: 強い acmart 3 本に ACM 適用。弱い acmart と IEEE 1998 は generic（過適用しない）

### C. GROBID header

- fixture TEI から title / authors / affiliations / `AFFILIATED_WITH` / abstract をパース
- `GROBID_URL` 未設定時はライブ呼び出しなし。クラウド URL は拒否
- このマシンに Docker/Java が無いため **ライブ比較は未実施**。次はローカル CRF コンテナで header だけ回す

### D. Layout parser

- MinerU は常駐コストとライセンスで見送り
- Docling を次の live PoC とする
- いま実装したのは `assignNativeTextToBoxes`: layout bbox のラベルに pdf.js 文字列を載せる

Evidence fusion: native タイトルを GROBID の別文字列で置き換えないことをテスト済み。

---

## 20. Production 統合案

**最初に入れる最小構成（baseline より明確に良く、M4 24GB で現実的なものだけ）:**

1. **Format Profile framework を import の横に置くが、parser はまだ pdfLayout。** 検出結果と Evidence を `PaperBlock.metadata` に書くだけ（schema migration なし）。
2. **Generic は現行 pdfLayout のまま。** 列読み順アルゴリズムは触らない。
3. **ACM / IEEE の hard rule を quality.ts / chrome 検出から Profile 宣言へ徐々に移す。** 回帰が全部通る範囲だけ。if ACM を pdfLayout に散らさない。
4. **page class を OCR 判定の前段に足す。** item 平均 < 10 は残し、garbled / mixed を追加。native を無条件 OCR しない。
5. **GROBID / Docling / MinerU はまだ Production に入れない。** ローカル GROBID が揃って header F1 が baseline を明確に超えたら、low-confidence 論文のヘッダだけ任意サイドカー。
6. **canonical relations は型と GT から。** DB 大規模変更はしない。

やらないこと（再掲）: pdfLayout 削除、structureService 全面書き換え、table cell 再構築、巨大 VLM 同梱、cloud parser、AI Chat、翻訳 / MADLAD 変更、pdf.js 6.x。

検証: `npm test`（116 passed）、`npm run lint`、`npm run build`。合成 fixture とキャッシュ済み real-paper の両方。
