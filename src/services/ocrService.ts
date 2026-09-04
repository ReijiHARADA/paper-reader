/**
 * OCR Service
 *
 * Tauri アプリ環境では Apple Vision Framework を呼び出す。
 * ブラウザ直接アクセス時はスタブ（スキャン PDF は Tauri 必須と案内）。
 */

import { isTauriApp } from "../utils/serverReady";

export type OcrLine = {
  text: string;
  confidence: number;
};

export type PageOcrResult = {
  pageNumber: number;
  lines: OcrLine[];
  fullText: string;
};

/** PDF ページを canvas に描画して PNG base64 を返す */
async function pageToBase64(pdfPage: unknown, scale = 2.0): Promise<string> {
  const canvas = document.createElement("canvas");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = pdfPage as any;
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  // "data:image/png;base64,..." から base64 部分だけ切り出す
  return canvas.toDataURL("image/png").split(",")[1];
}

/**
 * 1 ページを OCR にかける
 * @param pdfPage pdfjs-dist の PDFPageProxy
 * @param pageNumber 1-indexed ページ番号
 * @param languages OCR 言語ヒント（例: ["en-US", "ja-JP"]）
 */
export async function ocrPage(
  pdfPage: unknown,
  pageNumber: number,
  languages: string[] = ["en-US"]
): Promise<PageOcrResult> {
  if (!isTauriApp()) {
    return {
      pageNumber,
      lines: [],
      fullText:
        "[OCR はデスクトップアプリ版でのみ利用できます]",
    };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  const base64 = await pageToBase64(pdfPage, 2.0);
  const lines: OcrLine[] = await invoke("ocr_image", { imageb64: base64, languages });

  return {
    pageNumber,
    lines,
    fullText: lines.map((l) => l.text).join("\n"),
  };
}

/**
 * PDF 全ページを OCR にかけてテキストを結合する
 * @param pdfDoc pdfjs-dist の PDFDocumentProxy
 * @param languages OCR 言語ヒント
 * @param onProgress ページ進捗コールバック
 */
export async function ocrDocument(
  pdfDoc: unknown,
  languages: string[] = ["en-US"],
  onProgress?: (page: number, total: number) => void
): Promise<PageOcrResult[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = pdfDoc as any;
  const total: number = doc.numPages;
  const results: PageOcrResult[] = [];

  for (let i = 1; i <= total; i++) {
    onProgress?.(i, total);
    const page = await doc.getPage(i);
    const result = await ocrPage(page, i, languages);
    results.push(result);
  }

  return results;
}

/**
 * PDF が「スキャン PDF（テキストなし）」かどうかを判定する
 * 全ページで抽出されたテキストアイテム数が少ない場合を検出
 */
export function isScannedPdf(extractedTextItemCount: number, pageCount: number): boolean {
  // 1ページあたり平均 10 文字未満ならスキャン扱い
  return extractedTextItemCount / pageCount < 10;
}
