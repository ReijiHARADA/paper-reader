# Codex handoff: Paper Reader translation quality

Status: paused intentionally at v49. Do not mark the active goal complete.

## Current objective

Improve Paper Reader academic-paper translation quality to practical research use:

- ordinary body paragraph reader-visible fallback <= 5%
- hallucination / numeric / citation / statistical notation / experimental-condition corruption near zero
- do not reduce risk merely by increasing fallback
- keep `TRANSLATION_CORPUS_AUDIT.md` and `test-data/real-papers/audit-progress.json` updated
- if external or paid APIs are considered, recheck free-tier availability before every use

## Process state

All long-running processes are stopped.

- v49 `npm run bench:real-paper-translation -- --limit 12` was stopped at the user's request.
- `test-data/real-papers/reports/translation-audit.json` is a partial v49 report with `complete: false` and must not be treated as the authoritative whole-corpus metric.
- The translation server process and Python resource tracker were killed after the stop request; `pgrep -fl "tsx|benchmark-real-paper-translation|server.py|madlad|translation-server|python.*server"` returned no rows.

## Current pipeline/cache version

`3b-mt-v5-semantic-v49`

Files containing version:

- `translation-server/engines/segmenter.py`
- `src/services/translation/madladEngine.ts`
- `scripts/prepare-translation-manual-review.ts`

## Completed benchmark checkpoints

Last completed full-corpus run is v48:

- 21 catalog entries / 19 cached PDFs / 206 sampled rows.
- ordinary body prose: 74 rows, 60 automatic accepts, 14 reader-visible fallbacks.
- ordinary body reader-visible fallback: 18.9%.
- damaged extraction: 85 rows, 17 accepts, 68 fallbacks.
- lists: 23 rows, 20 accepts, 3 fallbacks.
- statistical prose: 6 rows, 3 accepts, 3 fallbacks.

v49 was started and reached 17 completed paper checkpoints before the user asked to stop. The partial report records `complete: false`; rerun v49 to completion before comparing corpus rates.

## Main changes currently in working tree since v43

- v44: failed chunks retry once with beam search (`num_beams=4`) before rescue segmentation.
- v45: rejected-chunk rescue splitters are enabled for nonrestrictive `where` clauses and appositive `a region ...` clauses.
- v46: scientific protection preserves parenthesized decimal result values such as `(0.006)`; source-grounded terminology normalization handles `wearable/wearability`, `counterbalancing`, `earring(s)`, and source-confirmed `less embarrassing / less impolite / less weird` polarity.
- v47: relaxed the abnormal phrase-repetition detector enough to avoid rejecting valid statistical/social-acceptability prose with repeated academic terms.
- v48: micro-batcher now preserves only the failed translation unit as exact source instead of falling back the entire paragraph.
- v49: client quality guard rejects leftover scientific placeholders even when MADLAD mutates placeholder letters into Greek/Cyrillic lookalikes such as `ΖZCIt2ZZ`.

## Important caveat

v48 reduces paragraph-level reader-visible fallback, but some accepted rows contain mixed Japanese plus exact English source sentences from partial-unit fallback. This is safer than hallucination, but it is not the same as a fully translated paragraph. The next benchmark improvement should add an explicit `partialSourceFallback` metric before using the v48/v49 accept count as product-readiness evidence.

## Tests run after v49 edits

Passed:

```bash
npx vitest run src/test/quality.test.ts src/test/glossary.test.ts
npx tsc --noEmit
cd translation-server && .venv/bin/python -m unittest tests.test_micro_batcher tests.test_segmenter tests.test_citation_protect tests.test_madlad_quality
```

## First commands when resuming

```bash
cd /Users/harada/Desktop/codex/projects/paper-reader
pgrep -fl "tsx|benchmark-real-paper-translation|server.py|madlad|translation-server|python.*server" || true
cd translation-server && PYTORCH_ENABLE_MPS_FALLBACK=1 .venv/bin/python server.py
```

In another terminal:

```bash
python3 - <<'PYRESUME'
import urllib.request
print(urllib.request.urlopen('http://127.0.0.1:8765/status', timeout=3).read().decode())
PYRESUME
npm run bench:real-paper-translation -- --limit 12
npm run audit:prepare-review
npm run audit:summarize-review
```

Confirm `/status` reports `3b-mt-v5-semantic-v49` before benchmarking.

## Recommended next actions

1. Complete the v49 full benchmark and regenerate review summaries.
2. Add partial-source-fallback metrics so English source slices inside accepted output are tracked separately from full translation accepts.
3. Continue manual semantic review of accepted ordinary body prose; do not relax quality gates based only on automatic accept counts.
4. Continue local/free EN-JA model or cascade evaluation. Do not add hallucination-word blacklists or paper-specific rules.
5. If a model/API outside the local stack is considered, verify the current free tier before use.
