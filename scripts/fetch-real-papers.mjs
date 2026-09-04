/**
 * Download OA / author-hosted PDFs for reading-order tests.
 * Does not write into jewelry-first-computing.
 *
 *   node scripts/fetch-real-papers.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  readFileSync(join(root, "test-fixtures/real-papers/catalog.json"), "utf8")
);
const outDir = join(root, catalog.pdfDir);
mkdirSync(outDir, { recursive: true });

function expandHome(p) {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

async function download(url, dest) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 PaperReaderTestCorpus/1.0",
      Accept: "application/pdf,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length < 8000 || !buf.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
    throw new Error(`not a PDF (${buf.length} bytes, starts ${buf.subarray(0, 16).toString("latin1")})`);
  }
  writeFileSync(dest, buf);
}

const results = [];
for (const paper of catalog.papers) {
  const dest = join(outDir, paper.filename);
  if (existsSync(dest)) {
    results.push({ id: paper.id, status: "exists", path: dest });
    continue;
  }

  let copied = false;
  for (const seed of paper.seedPaths ?? []) {
    const src = expandHome(seed);
    if (existsSync(src)) {
      copyFileSync(src, dest);
      results.push({ id: paper.id, status: "copied", from: src });
      copied = true;
      break;
    }
  }
  if (copied) continue;

  if (!paper.downloadUrl) {
    results.push({ id: paper.id, status: "missing-no-url" });
    continue;
  }

  try {
    await download(paper.downloadUrl, dest);
    results.push({ id: paper.id, status: "downloaded", bytes: (await import("node:fs")).statSync(dest).size });
  } catch (error) {
    results.push({
      id: paper.id,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

console.log(JSON.stringify(results, null, 2));
const ready = results.filter((r) => r.status === "exists" || r.status === "copied" || r.status === "downloaded");
console.log(`\n${ready.length}/${catalog.papers.length} PDFs ready in ${outDir}`);
