/**
 * Materialize a durable human-review queue from the latest local audit report.
 * Both the queue and progress live in ignored test-data because they contain
 * copyrighted source/translation excerpts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Label = "correct" | "minor_wording" | "terminology_error" | "semantic_shift" | "omission" | "addition" | "hallucination" | "numeric_error" | "citation_error" | "repetition" | "source_fragment" | "paragraph_merge" | "paragraph_split" | "chrome_contamination" | "list_flattening" | "table_contamination";
type Cause = "PDF extraction" | "reading order" | "line grouping" | "paragraph reconstruction" | "Canonical resolver" | "translation-unit segmentation" | "MADLAD decode" | "postprocess" | "quality gate" | "glossary/terminology";
type ExistingReview = { key: string; modelVersion?: string; translation?: string; labels: Label[]; severity: 0 | 1 | 2 | 3 | 4; primaryCause?: Cause; secondaryCauses?: Cause[]; notes?: string; recommendedFix?: string; reviewedAt?: string };

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const reportsDir = path.join(root, "test-data/real-papers/reports");
const outDir = path.join(root, "test-data/real-papers");
const reviewPath = path.join(outDir, "audit-manual-review.json");
type AuditReport = { papers: Array<{ paper: { id: string; title: string; disciplines?: string[]; formatFamily?: string }; rows: Array<Record<string, unknown>> }> };
// The completed whole-corpus report is the review population.  Atomic reports
// are interruption checkpoints from older pipeline versions; mixing them here
// made a stale result look like a current translation and inflated the queue.
// An annotation is reused only for exactly the same translated output. Source
// identity alone is insufficient, but a pipeline-version change that leaves
// both source and Japanese output byte-for-byte identical does not invalidate
// a human source/translation comparison.
const reportPaths = [path.join(reportsDir, "translation-audit.json")];
const reports = reportPaths.map((reportPath) =>
  JSON.parse(fs.readFileSync(reportPath, "utf8")) as AuditReport,
);
const old = fs.existsSync(reviewPath) ? JSON.parse(fs.readFileSync(reviewPath, "utf8")) as { reviews?: ExistingReview[] } : {};
const saved = new Map((old.reviews ?? []).map((review) => [review.key, review]));
const queue = new Map<string, ExistingReview>();
const completedPaperIds = new Set<string>();
for (const report of reports) for (const entry of report.papers) for (const row of entry.rows) {
  const source = String(row.source ?? "");
  const key = `${entry.paper.id}:${String(row.blockId)}:${source.slice(0, 80)}`;
  const current = {
    key,
    paperId: entry.paper.id,
    title: entry.paper.title,
    disciplines: entry.paper.disciplines ?? [],
    formatFamily: entry.paper.formatFamily ?? "unknown",
    blockId: String(row.blockId ?? ""),
    pageStart: Number(row.pageStart ?? 0),
    pageEnd: Number(row.pageEnd ?? 0),
    source,
    translation: String(row.translation ?? ""),
    modelVersion: String(row.modelVersion ?? "unknown"),
    sourceCategory: String(row.sourceCategory ?? "unknown"),
    fallbackStage: String(row.fallbackStage ?? "unknown"),
    fallbackReason: row.fallbackReason ? String(row.fallbackReason) : undefined,
    readerVisibleFallback: Boolean(row.readerVisibleFallback ?? row.sourceFallback ?? false),
    partialSourceFallback: Boolean(row.partialSourceFallback ?? false),
    partialSourceFallbackReason: row.partialSourceFallbackReason ? String(row.partialSourceFallbackReason) : undefined,
    productionDecision: row.wouldSubmitToModel
      ? (row.wouldAcceptTranslation ? "accept" : "post-model-fallback")
      : "pre-model-fallback",
  };
  // A full report can overlap an atomic per-paper report.  Keep just one
  // stable record keyed by source, while retaining any human annotation.
  const savedAnnotation = saved.get(key);
  const annotation = savedAnnotation?.translation === current.translation
    ? savedAnnotation
    : undefined;
  // Never copy the old source, translation, or production decision.  A saved
  // review may come from an earlier pipeline version; only its human judgment
  // can carry forward when the source identity is unchanged.
  queue.set(key, {
    ...current,
    labels: annotation?.labels ?? [],
    severity: annotation?.severity ?? 0,
    primaryCause: annotation?.primaryCause,
    secondaryCauses: annotation?.secondaryCauses,
    notes: annotation?.notes ?? "pending manual source/translation comparison",
    recommendedFix: annotation?.recommendedFix,
    reviewedAt: annotation?.reviewedAt,
  });
  completedPaperIds.add(entry.paper.id);
}
const reviews = [...queue.values()].sort((a, b) => a.key.localeCompare(b.key));
const archivedReviews = (old.reviews ?? [])
  .filter((review) => review.reviewedAt && !queue.has(review.key))
  .sort((a, b) => a.key.localeCompare(b.key));
const completed = reviews.filter((review) => review.reviewedAt).length;
const payload = {
  schemaVersion: 1,
  labelVocabulary: ["correct", "minor_wording", "terminology_error", "semantic_shift", "omission", "addition", "hallucination", "numeric_error", "citation_error", "repetition", "source_fragment", "paragraph_merge", "paragraph_split", "chrome_contamination", "list_flattening", "table_contamination"],
  causeVocabulary: ["PDF extraction", "reading order", "line grouping", "paragraph reconstruction", "Canonical resolver", "translation-unit segmentation", "MADLAD decode", "postprocess", "quality gate", "glossary/terminology"],
  reviews,
  archivedReviews,
  summary: { total: reviews.length, completed, pending: reviews.length - completed },
};
fs.writeFileSync(reviewPath, `${JSON.stringify(payload, null, 2)}\n`);
const progressPath = path.join(outDir, "audit-progress.json");
const previousProgress = fs.existsSync(progressPath)
  ? JSON.parse(fs.readFileSync(progressPath, "utf8")) as Record<string, unknown>
  : {};
const progress = {
  ...previousProgress,
  phase: "phase-2",
  lastBenchmarkVersion: "3b-mt-v5-semantic-v49",
  completedPapers: [...completedPaperIds].sort(),
  pendingPapers: [], reviewedBlocks: completed, archivedReviewedBlocks: archivedReviews.length, pendingManualReview: reviews.length - completed,
  unresolvedFailures: [
    "manual semantic review of current accepts",
    "measure partial source fallback inside accepted output before treating accept rate as fully translated rate",
    "fallback rate must be driven below 5% for product-quality reading UX",
    "unsafe false accepts dominated by semantic shift and omission without durable numeric/citation facts",
    "expand OA corpus to 50+ verified PDFs",
    "page/column paragraph repair",
    "chrome separation",
    "evaluate replacement or cascade translation models under local/free-use constraints",
  ],
  nextActions: [
    "complete a v49 full benchmark, then measure partial source fallback inside accepted output",
    "continue v41 manual comparison of accepted ordinary body prose before relaxing any gate",
    "use semantic-coverage audit scores to prioritize likely omissions and semantic shifts",
    "continue local/free EN-JA model comparison; do not enable cascade until manual review confirms semantic adequacy",
    "design production-safe content coverage checks that do not inflate reader-visible fallback",
    "add verified OA candidates with provenance",
  ],
};
fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
console.log(`review queue: ${completed}/${reviews.length} completed`);
