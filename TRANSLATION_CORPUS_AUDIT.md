# Cross-disciplinary translation audit

This audit makes real-paper translation failures reproducible without adding
copyrighted PDFs or translations to Git. The catalog is
`test-fixtures/real-papers/catalog.json`; PDFs and generated source/translation
pairs live only in the ignored `test-data/real-papers/` directory.

Run `npm run fetch:real-papers`, start the local translation server, then run:

```bash
npm run bench:real-paper-translation -- --paper ozchi-finger-specific-touch --limit 8
```

The evaluator runs the production `extractFromPages` Canonical pipeline, sends
sampled projected paragraph blocks to the running MADLAD server, and writes
both JSON and Markdown review queues in `test-data/real-papers/reports/`.
Every row records source, Japanese output, page span, structural warnings,
scientific invariants, token counts, and automatic quality score. Automatic
checks are triage only; semantic equivalence requires source/translation review.

## Initial local sample (2026-09-07)

The local cache contains the established HCI/wearable corpus plus public
arXiv papers for HCI research methods, cognitive psychology, quantitative
marketing, human factors/ergonomics, and computational linguistics. The first
manual pass found the same failure classes across fields.

| Failure class | Observed in | Cause | Safe current handling |
| --- | --- | --- | --- |
| Fluent phrase loop / unrelated concept | HCI and linguistics | greedy decoding can repeat a valid Japanese phrase while replacing the source concept | detect repeated multi-character spans and fall back to original |
| Incomplete source fragment | OzCHI, marketing, ergonomics | page/column boundary or header interruption produces a non-sentence block | do not send continuation-shaped text; show original until extraction is repaired |
| Chrome mixed into body | OzCHI, marketing | permission or running arXiv material became part of a paragraph before role resolution | keep the mixed block untranslated; repair line/block boundary separately |
| Flattened list | HCI methods, linguistics, cognitive tasks | PDF bullets were combined into one paragraph, so list items compete in a single decode | split multiple bullet items into independent translation units and restore bullet markers after translation |
| Numeric/probability loss | cognitive psychology, OzCHI | long lists and result summaries can drop values even if Japanese is fluent | existing invariant score rejects critical loss; list structure reduces the trigger |

The evaluator intentionally includes unsafe examples in its review queue. A
passing quality score does not mean the source was complete; source-boundary
checks run in the import policy before a block is submitted to MADLAD.

## First full run (2026-09-07, semantic-v3)

The local corpus had 18 catalog records, of which 16 PDFs were available (the
Wearable Acceptability URL failed and one publisher URL returned a different
paper, so that record is explicitly blocked). The audit sent two deliberately
spread samples per available paper: 32 source blocks in total.

| Production decision | Blocks | Interpretation |
| --- | ---: | --- |
| Accepted | 23 | The automatic guard found no structural or invariant failure. These remain a manual semantic-review queue. |
| Original before model | 9 | Continuation, chrome, or other unsafe source boundary was detected. |
| Original after quality gate | 9 | The generated output had a phrase loop, numeric/invariant loss, language failure, or another quality failure. Categories overlap because the audit deliberately probes unsafe input. |
| Score below 0.80 | 6 | Clear automatic preservation failures; the remaining quality fallbacks were caught by the phrase-loop detector, including repeated short Japanese propositions. |

The audit caught concrete failures in every priority area: HCI phrase loops;
cognitive choice-list number loss; marketing page-spanning contamination;
ergonomics and wearable-HCI continuation fragments; and OzCHI permission-text
interleaving. This establishes that the failure is cross-disciplinary rather
than a PDF-specific exception. It does not prove that the 23 accepted rows are
semantically perfect; those rows are the next human review set.

## Next corpus work

1. Add an OA biomedical/clinical article and a journal-publisher PDF with
   complex tables when stable direct PDF URLs are found.
2. Turn manually confirmed audit rows into copyright-safe fixtures made of
   short metadata and synthetic structural analogues, never copied full PDFs.
3. Measure block-level false-accept and false-reject rates after each change.
4. Improve upstream page/column stitching and chrome separation rather than
   relaxing the safe original fallback.
