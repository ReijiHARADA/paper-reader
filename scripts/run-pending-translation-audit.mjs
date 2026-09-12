/**
 * Run every locally cached paper that does not yet have a complete per-paper
 * audit checkpoint.  This intentionally works one paper at a time: each
 * benchmark writes an atomic report, so an interrupted long run can resume
 * without discarding completed work.
 *
 * Usage:
 *   node scripts/run-pending-translation-audit.mjs --dry-run
 *   node scripts/run-pending-translation-audit.mjs --limit 12
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIndex = args.indexOf("--limit");
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 12;
if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");

const catalog = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/real-papers/catalog.json"), "utf8"));
const reportPath = (id) => path.join(root, catalog.pdfDir, "reports", `translation-audit-${id}.json`);

function hasCompleteCheckpoint(paper) {
  const file = reportPath(paper.id);
  if (!fs.existsSync(file)) return false;
  try {
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    const entry = report.papers?.find((item) => item.paper?.id === paper.id);
    return report.complete === true && !entry?.error && Array.isArray(entry?.rows) && entry.rows.length >= limit;
  } catch {
    return false;
  }
}

const cached = catalog.papers.filter((paper) => fs.existsSync(path.join(root, catalog.pdfDir, paper.filename)));
const pending = cached.filter((paper) => !hasCompleteCheckpoint(paper));
const skipped = catalog.papers.filter((paper) => !fs.existsSync(path.join(root, catalog.pdfDir, paper.filename)));
console.log(`[audit-runner] cached=${cached.length} pending=${pending.length} skipped-no-pdf=${skipped.length} limit=${limit}`);
console.log(`[audit-runner] pending papers: ${pending.map((paper) => paper.id).join(", ") || "none"}`);
if (dryRun || pending.length === 0) process.exit(0);

const runnerLog = path.join(root, catalog.pdfDir, "audit-runner.log");
const appendLog = (message) => fs.appendFileSync(runnerLog, `${new Date().toISOString()} ${message}\n`);
let failures = 0;
for (const [index, paper] of pending.entries()) {
  const label = `${index + 1}/${pending.length} ${paper.id}`;
  console.log(`[audit-runner] start ${label}`);
  appendLog(`start ${label}`);
  const benchmark = spawnSync("npx", ["--yes", "tsx", "scripts/benchmark-real-paper-translation.ts", "--paper", paper.id, "--limit", String(limit)], {
    cwd: root,
    stdio: "inherit",
  });
  if (benchmark.status !== 0) {
    failures += 1;
    console.error(`[audit-runner] failed ${label}, retaining its checkpoint and continuing`);
    appendLog(`failed ${label} exit=${benchmark.status ?? "signal"}`);
    continue;
  }
  const queue = spawnSync("npx", ["--yes", "tsx", "scripts/prepare-translation-manual-review.ts"], {
    cwd: root,
    stdio: "inherit",
  });
  if (queue.status !== 0) {
    failures += 1;
    console.error(`[audit-runner] review queue update failed after ${label}`);
    appendLog(`queue-failed ${label} exit=${queue.status ?? "signal"}`);
  } else {
    console.log(`[audit-runner] complete ${label}`);
    appendLog(`complete ${label}`);
  }
}
console.log(`[audit-runner] finished pending=${pending.length} failures=${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
