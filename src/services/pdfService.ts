import * as pdfjsLib from "pdfjs-dist";
import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api";
import {
  figureImageRect,
  figureLookupKey,
  type LayoutBlock,
  type PageColumnLayout,
} from "./pdfLayout";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export type ExtractedTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  page: number;
};

export type ExtractedPage = {
  pageNumber: number;
  width: number;
  height: number;
  textItems: ExtractedTextItem[];
};

export type PDFExtractionResult = {
  pages: ExtractedPage[];
  metadata: {
    title?: string;
    author?: string;
    pageCount: number;
  };
};

function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return "str" in item;
}

export async function extractPDFContent(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<PDFExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const metadata = await pdf.getMetadata();
  const info = metadata.info as Record<string, unknown> | undefined;

  const pages: ExtractedPage[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    onProgress?.(pageNum, pdf.numPages);

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    const textItems: ExtractedTextItem[] = [];

    for (const item of textContent.items) {
      if (!isTextItem(item) || !item.str.trim()) continue;

      const tx = item.transform;
      const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);

      textItems.push({
        text: item.str,
        x: tx[4],
        y: viewport.height - tx[5],
        width: item.width,
        height: item.height,
        fontSize,
        fontName: item.fontName,
        page: pageNum,
      });
    }

    pages.push({
      pageNumber: pageNum,
      width: viewport.width,
      height: viewport.height,
      textItems,
    });
  }

  return {
    pages,
    metadata: {
      title: typeof info?.Title === "string" ? info.Title : undefined,
      author: typeof info?.Author === "string" ? info.Author : undefined,
      pageCount: pdf.numPages,
    },
  };
}

const IDENTITY_CTM = [1, 0, 0, 1, 0, 0];

function multiplyCtm(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function applyCtm(ctm: number[], x: number, y: number): [number, number] {
  return [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
}

type PlacedPdfImage = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function collectImagePlacements(
  operatorList: { fnArray: number[]; argsArray: unknown[][] },
  pageHeight: number
): PlacedPdfImage[] {
  const { OPS } = pdfjsLib;
  let ctm = IDENTITY_CTM;
  const stack: number[][] = [];
  const placed: PlacedPdfImage[] = [];

  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const fn = operatorList.fnArray[i];
    const args = operatorList.argsArray[i] ?? [];
    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? IDENTITY_CTM;
    } else if (fn === OPS.transform && args.length >= 6) {
      ctm = multiplyCtm(ctm, args as number[]);
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject
    ) {
      const id = String(args[0] ?? "");
      if (!id) continue;
      const corners = [
        applyCtm(ctm, 0, 0),
        applyCtm(ctm, 1, 0),
        applyCtm(ctm, 1, 1),
        applyCtm(ctm, 0, 1),
      ];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      placed.push({
        id,
        x: minX,
        y: pageHeight - maxY,
        width: maxX - minX,
        height: maxY - minY,
      });
    }
  }
  return placed;
}

type PdfImageObject = {
  width?: number;
  height?: number;
  kind?: number;
  data?: Uint8ClampedArray | Uint8Array;
  bitmap?: CanvasImageSource;
};

function readPdfImageObject(
  page: { objs: { get: (id: string) => unknown }; commonObjs: { get: (id: string) => unknown } },
  id: string
): PdfImageObject | null {
  try {
    const value = (id.startsWith("g_") ? page.commonObjs.get(id) : page.objs.get(id)) as
      | PdfImageObject
      | undefined;
    return value ?? null;
  } catch {
    try {
      return (page.commonObjs.get(id) as PdfImageObject) ?? null;
    } catch {
      return null;
    }
  }
}

function pdfImageToCanvas(img: PdfImageObject): HTMLCanvasElement | null {
  const bitmap = img.bitmap;
  const width = Number(img.width || (bitmap as { width?: number } | undefined)?.width || 0);
  const height = Number(img.height || (bitmap as { height?: number } | undefined)?.height || 0);
  if (!width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0);
    return canvas;
  }
  if (!img.data) return null;

  const imageData = ctx.createImageData(width, height);
  const dest = imageData.data;
  const src = img.data;
  const pixels = width * height;

  if (img.kind === pdfjsLib.ImageKind.RGBA_32BPP || src.length >= pixels * 4) {
    dest.set(src.subarray(0, dest.length));
  } else if (img.kind === pdfjsLib.ImageKind.RGB_24BPP || src.length >= pixels * 3) {
    let si = 0;
    let di = 0;
    for (let p = 0; p < pixels; p++) {
      dest[di++] = src[si++];
      dest[di++] = src[si++];
      dest[di++] = src[si++];
      dest[di++] = 255;
    }
  } else {
    return null;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  pad = 10
): boolean {
  return (
    a.x < b.x + b.width + pad &&
    b.x < a.x + a.width + pad &&
    a.y < b.y + b.height + pad &&
    b.y < a.y + a.height + pad
  );
}

function compositePlacedImages(
  items: { placed: PlacedPdfImage; canvas: HTMLCanvasElement }[]
): string | null {
  if (items.length === 0) return null;

  const unionX = Math.min(...items.map((i) => i.placed.x));
  const unionY = Math.min(...items.map((i) => i.placed.y));
  const unionRight = Math.max(...items.map((i) => i.placed.x + i.placed.width));
  const unionBottom = Math.max(...items.map((i) => i.placed.y + i.placed.height));
  const unionW = Math.max(1, unionRight - unionX);
  const unionH = Math.max(1, unionBottom - unionY);

  const scale = Math.min(
    4,
    Math.max(
      1,
      ...items.map((i) =>
        Math.min(
          i.canvas.width / Math.max(i.placed.width, 1),
          i.canvas.height / Math.max(i.placed.height, 1)
        )
      )
    )
  );

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(unionW * scale));
  out.height = Math.max(1, Math.round(unionH * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);

  for (const item of items) {
    ctx.drawImage(
      item.canvas,
      (item.placed.x - unionX) * scale,
      (item.placed.y - unionY) * scale,
      item.placed.width * scale,
      item.placed.height * scale
    );
  }

  const png = out.toDataURL("image/png");
  if (png.length > 1_800_000) {
    return out.toDataURL("image/jpeg", 0.92);
  }
  return png;
}

export async function extractFigureImages(
  file: File,
  layoutBlocks: LayoutBlock[],
  layouts: PageColumnLayout[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, string>> {
  const captions = layoutBlocks.filter((b) => b.role === "figure_caption");
  const images = new Map<string, string>();
  if (captions.length === 0 || typeof document === "undefined") {
    return images;
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const byPage = new Map<number, LayoutBlock[]>();
  for (const caption of captions) {
    const list = byPage.get(caption.pageStart) ?? [];
    list.push(caption);
    byPage.set(caption.pageStart, list);
  }

  let done = 0;
  const total = captions.length;

  try {
    for (const [pageNumber, pageCaptions] of byPage) {
      const layout = layouts[pageNumber - 1];
      if (!layout) continue;

      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const operatorList = await page.getOperatorList();
      const placements = collectImagePlacements(operatorList, viewport.height);

      const renderScale = 2;
      const renderViewport = page.getViewport({ scale: renderScale });
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = Math.ceil(renderViewport.width);
      pageCanvas.height = Math.ceil(renderViewport.height);
      const pageContext = pageCanvas.getContext("2d");
      if (!pageContext) continue;

      await page.render({
        canvas: pageCanvas,
        canvasContext: pageContext,
        viewport: renderViewport,
        annotationMode: pdfjsLib.AnnotationMode.DISABLE,
      }).promise;

      for (const caption of pageCaptions) {
        const crop = figureImageRect(caption, layoutBlocks, layout);
        const key = figureLookupKey(caption.text, caption.pageStart);
        done += 1;
        onProgress?.(done, total);

        const region = crop ?? caption.bbox;
        const matched = placements.filter(
          (img) =>
            img.width >= 36 &&
            img.height >= 36 &&
            boxesOverlap(img, region, 14)
        );

        const decoded = matched
          .map((placed) => {
            const obj = readPdfImageObject(page, placed.id);
            const canvas = obj ? pdfImageToCanvas(obj) : null;
            return canvas ? { placed, canvas } : null;
          })
          .filter((item): item is { placed: PlacedPdfImage; canvas: HTMLCanvasElement } =>
            Boolean(item)
          );

        const embedded = compositePlacedImages(decoded);
        if (embedded) {
          images.set(key, embedded);
          continue;
        }

        if (!crop) continue;
        const sx = Math.max(0, Math.floor(crop.x * renderScale));
        const sy = Math.max(0, Math.floor(crop.y * renderScale));
        const sw = Math.min(pageCanvas.width - sx, Math.ceil(crop.width * renderScale));
        const sh = Math.min(pageCanvas.height - sy, Math.ceil(crop.height * renderScale));
        if (sw < 8 || sh < 8) continue;

        const slice = document.createElement("canvas");
        slice.width = sw;
        slice.height = sh;
        const sliceContext = slice.getContext("2d");
        if (!sliceContext) continue;
        sliceContext.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
        images.set(key, slice.toDataURL("image/jpeg", 0.88));
      }
    }
  } finally {
    pdf.cleanup();
    await loadingTask.destroy();
  }

  return images;
}

export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
