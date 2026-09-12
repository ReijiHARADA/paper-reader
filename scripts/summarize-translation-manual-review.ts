/** Summarize completed human review without treating automatic checks as truth. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Review = { disciplines?: string[]; formatFamily?: string; labels?: string[]; severity?: number; productionDecision?: "accept" | "pre-model-fallback" | "post-model-fallback"; reviewedAt?: string };
type Metrics = Record<string, number>;
const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const input = path.join(root, "test-data/real-papers/audit-manual-review.json");
const output = path.join(root, "test-data/real-papers/audit-metrics.json");
const all = (JSON.parse(fs.readFileSync(input, "utf8")) as { reviews: Review[] }).reviews;
const reviewed = all.filter((review) => review.reviewedAt);

function summarize(reviews: Review[]): Metrics {
  const count = (predicate: (review: Review) => boolean) => reviews.filter(predicate).length;
  const total = Math.max(1, reviews.length);
  const fallback = count((r) => r.productionDecision !== "accept");
  const bad = (r: Review) => (r.severity ?? 0) >= 2;
  const has = (r: Review, label: string) => r.labels?.includes(label) ?? false;
  return {
    reviewed_blocks: reviews.length,
    automatic_accept_rate: count((r) => r.productionDecision === "accept") / total,
    pre_model_fallback_rate: count((r) => r.productionDecision === "pre-model-fallback") / total,
    post_model_fallback_rate: count((r) => r.productionDecision === "post-model-fallback") / total,
    semantic_error_rate: count((r) => bad(r) && (has(r, "semantic_shift") || has(r, "omission") || has(r, "addition"))) / total,
    hallucination_rate: count((r) => has(r, "hallucination")) / total,
    terminology_error_rate: count((r) => has(r, "terminology_error")) / total,
    numeric_statistical_error_rate: count((r) => has(r, "numeric_error")) / total,
    extraction_induced_error_rate: count((r) => bad(r) && ["source_fragment", "paragraph_merge", "paragraph_split", "chrome_contamination", "list_flattening", "table_contamination"].some((label) => has(r, label))) / total,
    unsafe_false_accept_rate: count((r) => r.productionDecision === "accept" && bad(r)) / Math.max(1, count((r) => r.productionDecision === "accept")),
    false_reject_rate: count((r) => r.productionDecision !== "accept" && (r.severity ?? 0) <= 1 && (has(r, "correct") || has(r, "minor_wording"))) / Math.max(1, fallback),
  };
}
function grouped(key: (review: Review) => string[]) {
  const groups = new Map<string, Review[]>();
  for (const review of reviewed) for (const value of key(review)) groups.set(value, [...(groups.get(value) ?? []), review]);
  return Object.fromEntries([...groups].sort().map(([name, rows]) => [name, summarize(rows)]));
}
const payload = { generatedAt: new Date().toISOString(), reviewQueue: all.length, reviewedBlocks: reviewed.length, overall: summarize(reviewed), byDiscipline: grouped((r) => r.disciplines?.length ? r.disciplines : ["unknown"]), byFormat: grouped((r) => [r.formatFamily ?? "unknown"]), note: "Rates are provisional until every queued block has manual review; automatic acceptance is not a correctness label." };
fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify(payload, null, 2));
