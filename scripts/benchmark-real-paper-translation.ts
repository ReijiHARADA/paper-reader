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
  // First, deliberately include risky shapes researchers need to trust.
  for (const block of eligible) {
    if (structuralWarnings(block).length > 0 && !result.includes(block)) result.push(block);
    if (result.length >= Math.ceil(max / 2)) break;
  }
  // Then take positions across the entire paper instead of only the abstract.
  for (let index = 0; result.length < max; index += 1) {
    const position = Math.min(
      eligible.length - 1,
      Math.floor((index * (eligible.length - 1)) / Math.max(max - 1, 1))
    );
    if (!result.includes(eligible[position])) result.push(eligible[position]);
  }
  return result;
}

async function translate(texts: string[]): Promise<ServerTranslation[]> {
  const response = await fetch(`${endpoint}/translate/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texts, source_language: "en", target_language: "ja" }),
  });
  if (!response.ok) throw new Error(`translation server ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as { results: ServerTranslation[] };
  return body.results;
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
  const failed = report.papers.flatMap((entry) => entry.rows).filter((row) => !row.translation);
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
    `- Translation units: ${completed.length}; failed requests: ${failed.length}`,
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
        row.translation ?? "[translation request failed]",
        ""
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const health = await fetch(`${endpoint}/health`);
  if (!health.ok) throw new Error(`MADLAD health check failed at ${endpoint}`);
  const selected = catalog.papers.filter((paper) => !onlyPaper || paper.id === onlyPaper);
  if (onlyPaper && selected.length === 0) throw new Error(`Unknown catalog paper: ${onlyPaper}`);
  const papers: Array<{ paper: CatalogPaper; rows: AuditRow[]; error?: string }> = [];

  for (const paper of selected) {
    const pdfPath = path.join(root, catalog.pdfDir, paper.filename);
    if (!fs.existsSync(pdfPath)) {
      papers.push({ paper, rows: [], error: `PDF not cached: ${pdfPath}` });
      continue;
    }
    try {
      const pages = await extractPdfPages(pdfPath);
      const extracted = extractQuietly(paper, pages);
      const sampled = sampleBlocks(extracted.blocks, perPaperLimit);
      const translated = await translate(sampled.map((block) => compact(block.original ?? "")));
      const rows = sampled.map((block, index): AuditRow => {
        const source = compact(block.original ?? "");
        const result = translated[index];
        return {
          blockId: block.id,
          role: block.type,
          pageStart: block.pageStart,
          pageEnd: block.pageEnd,
          source,
          translation: result?.text,
          modelVersion: result?.model_version,
          inputTokens: result?.input_tokens,
          outputTokens: result?.output_tokens,
          translationTimeMs: result?.translation_time_ms,
          sourceInvariants: extractScientificInvariants(source).map((item) => item.value),
          quality: result ? evaluateJaTranslation(result.text, source) : undefined,
          structuralWarnings: structuralWarnings(block),
          wouldSubmitToModel: shouldTranslateParagraph(source),
          wouldAcceptTranslation: result ? isPlausibleJaTranslation(result.text, source) : undefined,
        };
      });
      papers.push({ paper, rows });
      console.log(`${paper.id}: ${rows.length} translation units`);
    } catch (error) {
      papers.push({ paper, rows: [], error: error instanceof Error ? error.message : String(error) });
      console.error(`${paper.id}:`, error);
    }
  }
  const report = { createdAt: new Date().toISOString(), endpoint, papers };
  const reportDir = path.join(root, catalog.pdfDir, "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportName = onlyPaper ? `translation-audit-${onlyPaper}` : "translation-audit";
  fs.writeFileSync(path.join(reportDir, `${reportName}.json`), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(reportDir, `${reportName}.md`), markdownReport(report));
  console.log(`wrote ${path.join(reportDir, `${reportName}.{json,md}`)}`);
}

void main();
