/**
 * Run the production extraction and translation path on locally cached,
 * openly available real papers. PDFs and generated reports stay in
 * test-data/real-papers (gitignored); only the catalog and this evaluator are
 * committed.
 *
 * Usage:
 *   npx tsx scripts/benchmark-real-paper-translation.ts
 *   npx tsx scripts/benchmark-real-paper-translation.ts --paper ozchi-finger-specific-touch
 *   npx tsx scripts/benchmark-real-paper-translation.ts --limit 4
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFromPages } from "../src/services/pdfExtraction/pipeline/extractAcademicPdf.ts";
import { evaluateJaTranslation, extractScientificInvariants, isPlausibleJaTranslation, shouldTranslateParagraph } from "../src/services/translation/quality.ts";
import { normalizeSourceGroundedTerminology } from "../src/services/llm/glossaryService.ts";
import type { PaperBlock } from "../src/types/paper.ts";
import { extractPdfPages } from "../src/test/readingOrder/extractPdf.ts";

type CatalogPaper = {
  id: string;
  title: string;
  filename: string;
  disciplines?: string[];
  kinds?: string[];
};

type ServerTranslation = {
  text: string;
  model_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  translation_time_ms: number;
};

type AuditRow = {
  blockId: string;
  role: PaperBlock["type"];
  pageStart: number;
  pageEnd: number;
  source: string;
  translation?: string;
  sourceFallback?: boolean;
  modelVersion?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  translationTimeMs?: number;
  sourceInvariants: string[];
  quality?: ReturnType<typeof evaluateJaTranslation>;
  structuralWarnings: string[];
  wouldSubmitToModel: boolean;
  wouldAcceptTranslation?: boolean;
};

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
) as { pdfDir: string; papers: CatalogPaper[] };
const args = process.argv.slice(2);
const paperArg = args.indexOf("--paper");
const onlyPaper = paperArg >= 0 ? args[paperArg + 1] : undefined;
const limitArg = args.indexOf("--limit");
const perPaperLimit = limitArg >= 0 ? Number(args[limitArg + 1]) : 8;
const endpoint = process.env.MADLAD_BENCH_URL ?? "http://127.0.0.1:8765";

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function structuralWarnings(block: PaperBlock): string[] {
  const text = compact(block.original ?? "");
  const warnings: string[] = [];
  if (block.pageStart !== block.pageEnd) warnings.push("cross-page logical block");
  if (/^(?:fig(?:ure)?\.?|table)\s+\d+/i.test(text)) warnings.push("caption-shaped text");
  if (/\b(?:n\s*=|p\s*[<=>]|[FTZχ²]\s*\()/i.test(text)) warnings.push("scientific/statistical prose");
  if (/^(?:[-•‣∙]|\d+[.)])\s+/.test(text)) warnings.push("list-item boundary");
  if (/\b(?:and|or|but|to|of|for|where|which|that)\s*$/i.test(text)) warnings.push("ends like continuation");
  if (/^(?:and|or|but|to|of|for|where|which|that|one|exception)\b/i.test(text)) warnings.push("starts like continuation");
  return warnings;
}

function sampleBlocks(blocks: PaperBlock[], max: number): PaperBlock[] {
  const eligible = blocks.filter((block) => {
    const text = compact(block.original ?? "");
    return block.type === "paragraph" && text.length >= 90 && text.length <= 1_800;
  });
  if (eligible.length <= max) return eligible;
  const result: PaperBlock[] = [];
  const add = (block: PaperBlock | undefined) => {
    if (block && !result.includes(block)) result.push(block);
  };
  // Section-like lexical anchors make the sample cover ordinary prose as well
  // as high-risk layouts even when a PDF lacks clean Canonical sections.
  const strata: Array<RegExp> = [
    /^(?:abstract|summary)\b/i, /\b(?:introduction|background)\b/i,
    /\b(?:related work|literature review)\b/i, /\b(?:method|methodology|participants|procedure)\b/i,
    /\b(?:result|analysis|significant|p\s*[<=>]|confidence interval)\b/i,
    /\b(?:discussion|limitation|conclusion|future work)\b/i,
  ];
  for (const pattern of strata) add(eligible.find((block) => pattern.test(compact(block.original ?? ""))));
  for (const block of eligible) {
    if (structuralWarnings(block).length > 0) add(block);
    if (result.length >= Math.ceil(max * 0.65)) break;
  }
  for (let index = 0; result.length < max; index += 1) {
    add(eligible[Math.min(eligible.length - 1, Math.floor(index * (eligible.length - 1) / Math.max(max - 1, 1)))]);
  }
  return result.slice(0, max);
}

async function translate(texts: string[]): Promise<ServerTranslation[]> {
  // The application submits independent requests to the scheduler; it is the
  // scheduler, rather than this benchmark, which coalesces safe microbatches.
  // Calling /translate/batch here bypassed the client-equivalent source echo
  // fallback path and made audit rows disagree with the actual reader.
  return Promise.all(texts.map(async (text) => {
    const response = await fetch(`${endpoint}/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, source_language: "en", target_language: "ja" }),
    });
    if (!response.ok) throw new Error(`translation server ${response.status}: ${await response.text()}`);
    return (await response.json()) as ServerTranslation;
  }));
}

function extractQuietly(paper: CatalogPaper, pages: Awaited<ReturnType<typeof extractPdfPages>>) {
  // The legacy layout diagnostic is useful during parser work, but emits every
  // block to stdout. A corpus run must leave a readable progress log instead.
  const log = console.log;
  const info = console.info;
  const warn = console.warn;
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  try {
    return extractFromPages({
      pages,
      paperId: `translation-audit-${paper.id}`,
      filePath: paper.filename,
      fileHash: paper.id,
      metadata: { title: paper.title, pageCount: pages.length },
    });
  } finally {
    console.log = log;
    console.info = info;
    console.warn = warn;
  }
}

function markdownReport(report: {
  createdAt: string;
  endpoint: string;
  papers: Array<{ paper: CatalogPaper; rows: AuditRow[]; error?: string }>;
}): string {
  const completed = report.papers.flatMap((entry) => entry.rows).filter((row) => row.translation);
  const fallbacks = report.papers.flatMap((entry) => entry.rows).filter((row) => row.sourceFallback);
  const failed = report.papers.flatMap((entry) => entry.rows).filter((row) => !row.translation && !row.sourceFallback);
  const lowQuality = completed.filter((row) => (row.quality?.score ?? 1) < 0.8);
  const rejected = completed.filter((row) => row.wouldAcceptTranslation === false);
  const blockedBeforeModel = report.papers.flatMap((entry) => entry.rows).filter((row) => !row.wouldSubmitToModel);
  const warnings = completed.filter((row) => row.structuralWarnings.length > 0);
  const lines = [
    "# Real-paper translation audit (local, uncommitted)",
    "",
    `- Generated: ${report.createdAt}`,
    `- Endpoint: ${report.endpoint}`,
    `- Papers evaluated: ${report.papers.filter((entry) => !entry.error).length}/${report.papers.length}`,
    `- Model responses: ${completed.length}; original fallbacks: ${fallbacks.length}; failed requests: ${failed.length}`,
    `- Score below 0.80: ${lowQuality.length}; rejected by the production quality gate: ${rejected.length}`,
    `- Blocked by the production input policy before model submission: ${blockedBeforeModel.length}`,
    `- Units needing structural review: ${warnings.length}`,
    "",
    "Automatic checks catch malformed output and preservation failures. They do **not** establish semantic equivalence; every row below is a source/translation review queue.",
    "",
  ];
  for (const entry of report.papers) {
    lines.push(`## ${entry.paper.id} — ${entry.paper.title}`, "");
    if (entry.error) {
      lines.push(`Evaluation error: ${entry.error}`, "");
      continue;
    }
    lines.push(`Disciplines: ${(entry.paper.disciplines ?? ["unclassified"]).join(", ")}`, "");
    for (const row of entry.rows) {
      lines.push(
        `### ${row.blockId} · pages ${row.pageStart}${row.pageEnd !== row.pageStart ? `–${row.pageEnd}` : ""}`,
        "",
        `- Role: ${row.role}; quality: ${row.quality?.score ?? "request failed"}; production decision: ${row.wouldSubmitToModel ? (row.wouldAcceptTranslation ? "accept" : "original fallback after quality gate") : "original fallback before model"}; warnings: ${row.structuralWarnings.join(", ") || "none"}`,
        `- Invariants: ${row.sourceInvariants.join(", ") || "none"}`,
        "",
        "**Source**",
        "",
        row.source,
        "",
        "**Japanese**",
        "",
        row.translation ?? (row.sourceFallback ? "[original fallback]" : "[translation request failed]"),
        ""
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  console.log(`[audit] start endpoint=${endpoint} paper=${onlyPaper ?? "all"} limit=${perPaperLimit}`);
  const health = await fetch(`${endpoint}/health`);
  if (!health.ok) throw new Error(`MADLAD health check failed at ${endpoint}`);
  const selected = catalog.papers.filter((paper) => !onlyPaper || paper.id === onlyPaper);
  console.log(`[audit] selected=${selected.length}`);
  if (onlyPaper && selected.length === 0) throw new Error(`Unknown catalog paper: ${onlyPaper}`);
  const papers: Array<{ paper: CatalogPaper; rows: AuditRow[]; error?: string }> = [];
  const reportDir = path.join(root, catalog.pdfDir, "reports");
  const reportName = onlyPaper ? `translation-audit-${onlyPaper}` : "translation-audit";
  const saveCheckpoint = () => {
    const report = { createdAt: new Date().toISOString(), endpoint, papers, complete: papers.length === selected.length };
    fs.mkdirSync(reportDir, { recursive: true });
    const jsonPath = path.join(reportDir, `${reportName}.json`);
    fs.writeFileSync(`${jsonPath}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
    fs.renameSync(`${jsonPath}.tmp`, jsonPath);
    fs.writeFileSync(path.join(reportDir, `${reportName}.md`), markdownReport(report));
  };

  for (const paper of selected) {
    const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
    if (!fs.existsSync(pdfPath)) {
      papers.push({ paper, rows: [], error: `PDF not cached: ${pdfPath}` });
      saveCheckpoint();
      continue;
    }
    try {
      const pages = await extractPdfPages(pdfPath);
      const extracted = extractQuietly(paper, pages);
      const sampled = sampleBlocks(extracted.blocks, perPaperLimit);
      // Mirror the import path: unsafe physical fragments are retained as
      // source before MADLAD is contacted. Translating every sampled block
      // made the audit itself manufacture outputs that production can never
      // show, and incorrectly attributed those fragment translations to the
      // model quality gate.
      const modelInputs = sampled
        .map((block, index) => ({
          index,
          source: compact(block.original ?? ""),
        }))
        .filter(({ source }) => shouldTranslateParagraph(source));
      const translated = await translate(modelInputs.map((entry) => entry.source));
      const resultBySampleIndex = new Map(
        modelInputs.map((entry, index) => [entry.index, translated[index]])
      );
      const rows = sampled.map((block, index): AuditRow => {
        const source = compact(block.original ?? "");
        const wouldSubmitToModel = shouldTranslateParagraph(source);
        const result = resultBySampleIndex.get(index);
        // Match the production path's deterministic, source-grounded
        // terminology pass. Per-paper LLM glossaries remain intentionally
        // excluded here because this audit must be reproducible offline.
        const sourceFallback = !wouldSubmitToModel || result?.text === source;
        const normalizedTranslation = result && !sourceFallback
          ? normalizeSourceGroundedTerminology(source, result.text)
          : undefined;
        return {
          blockId: block.id,
          role: block.type,
          pageStart: block.pageStart,
          pageEnd: block.pageEnd,
          source,
          translation: normalizedTranslation,
          sourceFallback,
          modelVersion: result?.model_version,
          inputTokens: result?.input_tokens,
          outputTokens: result?.output_tokens,
          translationTimeMs: result?.translation_time_ms,
          sourceInvariants: extractScientificInvariants(source).map((item) => item.value),
          quality: normalizedTranslation ? evaluateJaTranslation(normalizedTranslation, source) : undefined,
          structuralWarnings: structuralWarnings(block),
          wouldSubmitToModel,
          wouldAcceptTranslation: sourceFallback ? false : normalizedTranslation ? isPlausibleJaTranslation(normalizedTranslation, source) : undefined,
        };
      });
      papers.push({ paper, rows });
      saveCheckpoint();
      console.log(`${paper.id}: ${rows.length} translation units (checkpoint saved)`);
    } catch (error) {
      papers.push({ paper, rows: [], error: error instanceof Error ? error.message : String(error) });
      saveCheckpoint();
      console.error(`${paper.id}:`, error);
    }
  }
  saveCheckpoint();
  console.log(`wrote ${path.join(reportDir, `${reportName}.{json,md}`)}`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
