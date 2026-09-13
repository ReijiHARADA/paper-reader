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

## Phase 2 protocol

Phase 2 targets at least 50 verified PDFs and 12 section-stratified blocks per
paper. The review command below materializes `audit-manual-review.json` and
`audit-progress.json` under ignored `test-data/real-papers/`; it preserves
completed labels across benchmark reruns.

```bash
npm run bench:real-paper-translation -- --limit 12
npm run audit:prepare-review
```

Every row must receive one or more labels, severity `0`–`4`, a primary cause,
optional secondary causes, and a recommended general fix. Aggregate metrics
must use these labels: an automatic accept with manual severity at least `2`
is an unsafe false accept. A production fallback with a manually correct source
is a false reject.

## Phase 2 reviewed result: HCI course material (12 blocks)

Manual comparison found **two unsafe false accepts**: a malformed course
sentence accepted as fluent Japanese, and a page/paragraph fragment beginning
with `data.` accepted as `データ。`. Both have severity 3 and primary cause
`paragraph reconstruction`; this is evidence that source completeness must be
evaluated before translation, rather than only by Japanese output quality. Two
MADLAD repetition failures (severity 4) were correctly rejected after decode.

## Phase 2 reviewed result: cognitive psychology (12 blocks)

The arXiv cognitive-psychology paper adds a distinct high-risk format: prose
interleaved with figure labels, choice lists, and statistical notation. Manual
comparison found that all seven automatically accepted blocks had a severity
of at least 2. This is a small, deliberately risk-stratified sample and is not
a field-wide rate. It does establish three general failures that need upstream
work: figure-label/body merging, incomplete paragraph acceptance, and
terminology drift such as translating *vignette* as a material rather than an
experimental scenario. Four model outputs were safely rejected after decode,
including a long phrase loop and numeric/list corruption.

At this checkpoint the durable manual queue contains 57 rows and 24 completed
reviews. Across those completed, the provisional unsafe false-accept rate is
75% (9 of 12 accepted rows); the rate is intentionally not generalized until
ordinary-body samples and more publisher formats are reviewed. The machine
readable metrics are regenerated with:

```bash
npm run audit:prepare-review
npm run audit:summarize-review
```

The scripts merge every atomic `translation-audit-*.json` checkpoint, retain
existing human labels, and write ignored progress/metric files so a stopped
run can resume without losing reviewed rows.

## Phase 2 checkpoint: 48 reviewed blocks

The first four 12-block strata now cover HCI methods, cognitive psychology,
quantitative marketing, and ergonomics/iHCI. The durable queue has 75 rows;
48 have manual labels. The provisional aggregate has an extraction-induced
error rate of 54.2%, while the unsafe false-accept rate is 66.7% (12 accepted
blocks are severity 2 or higher). These numbers are not representative
prevalence estimates because the sampling intentionally includes risky
sections; they are evidence that accepted Japanese alone is not a safety
criterion.

The clearest cross-format finding is that paragraphs beginning or ending in a
continuation, figure/table layouts flattened into prose, and chrome/body
mixtures must be resolved before translation. The current pre-model fallback
prevents many of these from reaching users, but it also has a provisional 10%
false-reject rate. The next work remains broader corpus coverage and fixing
general paragraph/region reconstruction rather than tightening a Japanese
output blacklist.

## Implemented audit-driven repair: page wrap around a figure caption

The Power-over-Skin regression exposed an incomplete paragraph ending on page
1 right column (`...patch which logs`), a Figure 1 caption, then page 2 left
column beginning `data, and ...`. The previous resolver kept the caption
separate but also prevented the two paragraph pieces from meeting. The layout
merger now searches past figure/table caption blocks when both adjacent
paragraphs are clear continuations, and recognizes the normal right-column to
next-page left-column reading-order wrap. It still requires an incomplete
predecessor and continuation-shaped successor.

On the real PDF, the standalone `data, and ...` block fell from one to zero;
the repaired canonical paragraph spans pages 1–2. The figure caption remains
a separate block. Reading-order regression tests and the production build pass.

## Implemented audit-driven reliability fix: isolate quality fallback

The first `thermal-earring` audit returned HTTP 500 because one degenerate
MADLAD decode raised through the microbatch scheduler and aborted every item
in its request. A quality rejection is expected control flow: it must preserve
that source block, not make the translation service unavailable. The scheduler
now returns an original-text result only for the affected item; the existing
client quality gate treats that source echo as a fallback while independent
items continue. The same paper subsequently completed all 12 audit rows, and
the translation-server microbatch and segmenter suites pass 14 tests.

## Implemented audit-driven guard: flattened layout labels

The cognitive-psychology regression contained a paragraph where diagram labels
were flattened into `Linda Cab Hospital Toma Test Wason ...`. It was previously
accepted and rendered as a misleading Japanese sentence. `shouldTranslateParagraph`
now treats a run of at least five title-cased labels followed by ordinary prose
as an incomplete layout unit. This is a structural rule rather than a
paper-specific vocabulary list. On the identical real-PDF benchmark, the row
changed from model submission/acceptance to `wouldSubmitToModel: false`; it is
now preserved as source text until the figure region is reconstructed.

## Implemented audit-driven fix: duplicate list markers

The HCI design-paper audit found valid list content rendered with duplicate
markers such as `• - item` and `• • item`. The semantic segmenter already
keeps list items separate, but MADLAD can preserve a marker while the joiner
also restores one. The joiner now removes only a leading model-generated list
marker before adding its single canonical source marker. The translation-server
segmenter suite passes eight tests in the same virtual environment used by the
local server.

## Phase 2 checkpoint: 60 reviewed blocks

The five priority disciplines now each have a 12-block manual stratum. The
overall provisional unsafe false-accept rate is 64.3%; 46.7% of reviewed input
was automatically accepted and 46.7% had an extraction-induced label. The
computational-linguistics stratum is comparatively clean structurally, but it
still exposes decode-time repetition and loss of mathematical detail. This
confirms that input validation and decoder quality guards address separate
failure layers and both must remain in the pipeline.

## Next corpus work

1. Add an OA biomedical/clinical article and a journal-publisher PDF with
   complex tables when stable direct PDF URLs are found.
2. Turn manually confirmed audit rows into copyright-safe fixtures made of
   short metadata and synthetic structural analogues, never copied full PDFs.
3. Measure block-level false-accept and false-reject rates after each change.
4. Improve upstream page/column stitching and chrome separation rather than
   relaxing the safe original fallback.

## Continuous audit checkpoint: all locally cached PDFs

The audit runner now processes every cached catalog PDF that lacks a complete
12-block atomic checkpoint, then rebuilds the human-review queue before moving
to the next paper. This avoids treating a completed collection pass as the end
of translation-quality work: all 16 locally cached PDFs are now benchmarked,
and the queue contains 193 source/translation comparisons, of which 84 have
manual labels at this checkpoint. The runner log and queue are ignored runtime
artifacts; the runner itself is `scripts/run-pending-translation-audit.mjs`.

## Implemented audit-driven guard: literal decode byte escapes

The SpeeChin abstract was accepted despite containing literal decoder byte
escapes (`<0xE9><0xA0>...`) inside an otherwise Japanese output. This is a
model decode failure, not a valid proper noun or a paper-specific word. The
translation quality gate now classifies any such byte-escape token as
degenerate output, so the existing fallback retains the English source. On
the same real-PDF benchmark row, the production decision changed from accept
(`0.911`) to original fallback (`0.761`, with `degenerate output`). A unit test
covers the general pattern; quality tests and the production web build pass.

## Implemented audit-driven repair: prose-bearing table rows

The education survey exposed two table failures that text-only checks could not
reliably identify. A system-description table joined a short left cell with
long prose right cells; a book-list table joined title, author, year, publisher,
and page-count cells. Both were projected as paragraphs and were submitted to
MADLAD, allowing fluent but fabricated Japanese to be accepted.

Generic table evidence now recognizes repeated native multi-cell rows with a
separate indented description column, in addition to the existing short/numeric
cell grid. This evidence receives a high table score only when the geometry is
present; the resolver otherwise keeps its paragraph fallback. Re-running the
same education PDF removed both problematic source rows from the 12-block
paragraph translation sample. The result protects the reader from translating
flattened table cells while preserving ordinary prose for translation.

## Implemented audit-driven guard: editorial-date bylines

The Scientific Reports sample contained an author byline joined with
`Accepted: 27 December 2017`. It was incorrectly handled as a paragraph and
translated into a fictional Japanese biographical event. Paragraph input
validation now excludes editorial-state date markers (`Accepted`, `Received`,
`Revised`, `Published`, and `Available online`) with a full date. This is
publisher-agnostic metadata detection, not an author-name blacklist. The
same-PDF rerun removed that byline from model submission; the quality suite
now includes a regression test for it.

## Continuous audit checkpoint: semantic units and scientific identifiers

The PMLR economics PDF exposed two distinct safety failures. A flattened inline
list, `(1) …; (2) …; (3) …`, was sent as one translation unit, allowing the
decoder to omit conditions. The shared segmenter now isolates an inline
numbered list only when two or more ordinal markers are present; the source
round-trip invariant remains intact. This is separate from bullet handling and
covers ordinary academic limitation/result lists.

The same audit showed that a fluent result could omit a method or metric
acronym such as `MSE`, `NPIV`, or `DeepIV`. Acronym loss is now a critical
scientific-invariant failure in the production gate, so it selects the original
source rather than accepting a changed research claim. Author-year parenthetic
reference groups are protected atomically to preserve authors and years. A
trial that also placeholder-protected every short acronym was rejected during
validation because MADLAD could move those placeholders to the end of Japanese
sentences; that unsafe rule was not retained.

The translation cache identity is now `3b-mt-v5-semantic-v3`, matching the
server, so translations created before these segmentation and preservation
rules are not reused. Regression coverage: 29 Python translation-server tests
and 28 TypeScript quality tests.

## Continuous audit checkpoint: inline enumerations

The PMLR inline-list regression was run against the live development server
after detaching ordinal markers before decode. The previous output fabricated a
sequence from `(1)` through `(13)`; the new output retains exactly `(1)`, `(2)`,
and `(3)` without synthetic entries. The remaining mistranslation of `IV` is
correctly rejected by the strengthened acronym invariant, so it cannot be
stored as a fluent but false translation. This is intentionally a safe fallback
until a general terminology strategy can produce a faithful Japanese expansion.

## Continuous audit checkpoint: omission and interleaved numeric cells

Manual review found a severity-4 accepted omission: an 803-character,
multi-sentence cognitive-psychology paragraph was rendered as a 16%-length
Japanese summary. The long-source guard now rejects outputs below 20% only
when the source is at least 500 characters; the corpus's manually correct
long translations bottom out above 22%. The stored failure now receives the
production original-fallback decision. A separate source-input rule blocks a
lowercase word split by a standalone numeric cell (`dol- 2 lars`), which is
geometry/table contamination rather than valid hyphenation.

## Continuous audit checkpoint: incomplete physical blocks

Three previously accepted severity-3 source fragments share a layout-independent
signature: a lower-case sentence tail at block start (`data. This procedure …`)
or a final noun phrase cut after words such as `the entire`. The input validator
now retains these original blocks until upstream paragraph stitching repairs
them. Along with the existing title-label and numeric-cell guards, this turns
the audited `Linda Cab Hospital …`, `Mean regret … dol- 2 lars`, `data. This
procedure …`, and `Looking at the entire` cases away from model submission.

## Continuous audit checkpoint: lower-case continuation repair

A remaining accepted Power-over-Skin fragment began `substantially improves …`:
it is the continuation of a preceding sentence, not a grammatical paragraph.
The input policy now holds long lowercase-start blocks for upstream stitching,
while explicitly allowing common lower-case discourse abbreviations such as
`e.g.` and `i.e.`. This is a source-boundary rule, independent of paper title
or vocabulary. The quality suite has 34 passing tests and the production web
build passes after this change.

## Continuous audit checkpoint: negated scientific claims

A marketing/consumer-behavior regression accepted a translation that dropped
`does not consider x to be important`, reversing a premise of the utility
analysis. The quality gate now treats explicit English negation without a
Japanese negative marker as a hard preservation failure. It recognizes
predicate negation, `cannot`, `never`, `without`, and lack/absence wording,
while avoiding `not only` as a false signal. The stored regression now selects
original fallback; paired positive and negative Japanese tests prevent an
over-broad rejection.

## Continuous audit checkpoint: bounded long-clause segmentation

For a sentence longer than 360 characters, the semantic segmenter may now split
at a top-level semicolon only when each side has at least 100 characters.
Citation groups are protected before scanning, so author-year semicolons cannot
be used as a boundary. This improves long multi-clause prose without returning
to global semicolon splitting. Captions with only a short leading semicolon
remain pending for structure-aware caption handling.

## Continuous audit checkpoint: figure-caption lead preservation

The pending caption case is now covered without a paper-specific rule. For an
otherwise overlong caption whose short lead has the structural shape quoted
work title + `Fig.`/`Figure` identifier + semicolon, the segmenter emits that
lead as one unit and translates the remaining descriptive sentence separately.
The rule is only considered after ordinary top-level safe-clause boundaries and
requires at least 120 characters after the boundary.

A live development-server regression used the previously severity-3 `Traces`
caption. Its earlier stored translation ended after the general discussion of
jewellery and omitted the material description. With model version
`3b-mt-v5-semantic-v3`, the output retains the porcelain pearl, porcelain
clasps, velvet, and etched contours/folds/hinges. The Japanese still needs
terminology review, but the omission has been removed. Regression coverage is
33 Python translation-server tests and 36 TypeScript quality tests; the
production web build passes.

## Continuous audit checkpoint: complete sentence boundaries and decode loops

A wearable-computing paragraph exposed a semantic-unit bug: `_merge_fragments()`
joined every sentence beginning with a connective, including the complete
purpose sentence `To decrease form factors further, …`. MADLAD consequently
omitted that claim. The merger now joins only sub-four-word fragments and
standalone references; a terminal punctuation boundary is otherwise retained.
The live regression now includes the formerly missing claim.

A separate CHI course-description regression isolated a decoder loop, not an
extraction or batching fault: one complete parallel sentence (`how to …, how
to …, and how to …`) caused greedy decode to repeat the same Japanese phrase.
`no_repeat_ngram_size=4` is now applied in both sequential and micro-batched
generate calls. On the same live source, the repeated phrase disappeared and
the output retained every course topic. Cache identity is now
`3b-mt-v5-semantic-v4`; old outputs cannot be reused after this decode change.

## Continuous audit checkpoint: typographic quotation scanner

A severe cognitive-psychology regression was traced to the segmenter's quote
state rather than to the model: opening `“` and closing `”` had been treated
as different toggles, so one quoted problem name suppressed every later
sentence boundary. A 1,575-character paragraph was therefore submitted as one
unit and returned only its first sentence. The scanner now tracks paired
straight and typographic quotes and ignores apostrophes inside words. The same
source produces nine translation units and a 400-token output instead of a
38-token output. Cache identity is now `3b-mt-v5-semantic-v5`.

The revised output still compresses details of the final hospital vignette.
Its missing numeric/citation invariants cause the existing client quality gate
to keep the original instead of storing a misleading partial translation. This
is an unresolved long-sentence semantic-fidelity case, not represented as a
successful translation.

## Continuous audit checkpoint: quote-state generalization

Two additional cognitive-psychology blocks with quoted task names confirmed the
quote-state repair is general: their prior outputs contained only an opening
sentence, while the revised server translates the full sequence of task
sentences. One output still repeated `machine` and is rejected by the existing
degenerate-output gate. Another passes formal checks but translates
`vignette-based` as `ビニールに基づく`, a terminology/semantic error. This is
recorded as a remaining false-accept pattern: structural and invariant checks
cannot establish the Japanese meaning of an ordinary English research term.

## Continuous audit checkpoint: source-preserving relative clauses

A long `…, in which participants are asked …` sentence was still decoded as a
partial translation even after ordinary sentence segmentation. The segmenter
now represents a Translation Unit with an exact source slice and a separate,
aligned model input. For long scholarly entities (problem/task/study/experiment/
method/model/system/case), the source remains round-trip reconstructible while
the model receives the relative clause as `In this context, participants …`.
On the hospital-problem regression this restored the hospital comparison and
60% condition; output tokens increased from 400 to 465.

The same source exposed native-text superscript citations concatenated to a
preceding quoted term (`problem”16 (`). These are now protected as inline
footnote citations and evaluated as critical invariants. Cache identity is
`3b-mt-v5-semantic-v7`.

## Continuous audit checkpoint: source-preserving predicate lists

The cognitive-psychology audit found a serious false accept in an otherwise
well-formed abstract. The source sentence described four positive GPT-3
behaviours after a colon, but greedy MADLAD emitted only the lead sentence and
silently omitted all four facts. The existing quality gate accepted it because
there were no numeric or citation invariants to lose.

`TranslationUnit` now recognises only a narrow high-confidence structure: a
long colon-led list with an explicit technical/model subject and at least three
substantial coordinated predicates. It retains exact source slices and commas
for round-trip reconstruction, but supplies independent model inputs by
repeating the already-present subject (`GPT-3 solves …`, `GPT-3 is able …`).
This is not a general comma splitter.

On the real `Using cognitive psychology to understand GPT-3` regression, model
version `3b-mt-v5-semantic-v11` retains all four claims: vignette-task
performance, decisions from descriptions, multi-armed-bandit performance, and
model-based reinforcement-learning signatures. The preceding version emitted
none of those details. Source-grounded terminology normalization also maps the
observed model homophones only when the English source supplies the term:
`vignette` → `ヴィネット` and `multi-armed bandit` → `多腕バンディット課題`.

The remaining false accepts are now narrower semantic errors inside otherwise
complete sentences (for example awkward paraphrase or a wrong ordinary term).
They cannot be treated as equivalence merely because the formal invariant gate
passes, so manual semantic review remains required.

## Current resumable state (2026-09-10)

- Development server: `127.0.0.1:8766`, `3b-mt-v5-semantic-v11`; the installed
  app server on `8765` is deliberately untouched.
- Latest focused real-paper audit: 12 blocks from
  `cognitive-psychology-gpt3`; 3 pre-model structural fallbacks and 4
  post-model quality fallbacks remain safety fallbacks.
- The next audit pass should run the v11 regression set across completed
  disciplines, then continue OA corpus expansion and manual labels. Do not
  count automatic accepts as semantic correctness.

## Continuous audit checkpoint: semantic-v11 cross-discipline regression

The v11 live regression completed without translation-server request failures.
It evaluated 19 of 21 selected catalog papers (two yielded no usable sampled
translation unit in this run), spanning 204 translation units. The automatic
results were: 34 scores below 0.80, 51 post-model original fallbacks, 66
pre-model input-policy fallbacks, and 82 units marked for structural review.

This is a safety and regression result, not a semantic accuracy claim. The
v11 predicate-list repair retained the previously omitted cognitive-psychology
claims, and no micro-batch mapping failure was observed. The next pass is to
manually label automatic accepts from this fixed v11 corpus, prioritising
accepted long sentences and discipline-specific terminology, then make only
source-grounded general repairs.

## Continuous audit checkpoint: title-case system identifiers

A Power-over-Skin abstract previously passed formal checks while dropping the
paper's named system and replacing it with a generic description. Hyphenated
Title-Case identifiers are now protected before generation and included in the
client-side scientific invariants. On the live `3b-mt-v5-semantic-v12` server,
the full abstract retains `Power-over-Skin` in the Japanese output. The rule
requires an initial Title-Case token, optional lower-case linker tokens, and a
later Title-Case token, so it targets named systems rather than ordinary
hyphenated prose.

## Continuous audit checkpoint: transparent layout chrome in paragraph repair

An HCI course-material PDF exposed a physical paragraph split across a page turn
and intervening layout objects: the preceding block ended `... the other inputs
the`, while the next body block began `data. This procedure ...`. The objects in
between were a figure caption, a small numbered footnote, and a repeated running
title that had been weakly classified as a paragraph.

The canonical layout repair now treats captions, true footnotes, small numbered
footnotes, and repeated short Title-Case running headers as transparent only
while searching for an immediately adjacent unfinished paragraph. It joins only
when the source has a grammatical continuation and the geometry supports a
same-page or page-wrap reading order. It does not synthesize missing text. The
real PDF now reconstructs the logical paragraph with `pageStart: 2` and
`pageEnd: 3`, including the exact source sequence `inputs the data. This
procedure ...`. A catalog-based real-PDF regression asserts that this logical
paragraph remains intact.

Focused v12 server audits were rerun for the cognitive-psychology and HCI
corpora. The former confirms that the previously omitted GPT-3 predicate list
is now represented as distinct source-aligned translation units. It also shows
why automatic acceptance alone is insufficient: fluent Japanese can still alter
ordinary semantic relations without losing numbers or citations. Those cases
remain in manual review; no source-specific output blacklist was added.

## Continuous audit checkpoint: per-unit omission guard

The server previously applied its decode check only after all sentence units had
been joined. A long paragraph could therefore pass when one unit was reduced to
a short fluent conclusion while neighbouring units translated normally. A live
v12 case contained a 174-character sentence describing the smaller comparison
group and its variance; MADLAD returned only a 26-character Japanese statement
that the probability was equal.

Semantic v13 now checks every substantial natural-language translation unit
before it is joined. It applies only to a source unit of at least 140 compact
characters and 18 English words, and rejects a Japanese output below 18% of
that unit's compact length. Labels, equations, identifiers, and short captions
are outside this guard. The server then returns the exact original for the
whole paragraph; the client recognizes source echo and records an original
fallback. This deliberately preserves a source-visible uncertainty rather than
storing a summary that removes experimental conditions. A live v13 request of
the regression unit now returns its 174-character original instead of the
26-character partial Japanese decode.

## Continuous audit checkpoint: request-isolated generation

Further v13 verification found that the per-unit guard was correct for a single
reader request but could be defeated when the microbatch scheduler flattened
units from unrelated paragraphs into one padded `generate()` call. The same
source paragraph then produced a fluent, incomplete Japanese output. This is a
batch-dependent decoder behaviour, not an extraction or terminology rule.

Semantic v14 retains scheduling and per-paragraph sentence-unit batching, but
never puts units from different logical paragraphs into the same model generate
call. The tradeoff is lower maximum throughput during large imports; it prevents
neighbouring request lengths from changing the translation of a research claim.
The real-paper audit now uses the same concurrent `/translate` scheduler path
as the reader rather than calling the server-only batch endpoint. On the
12-block cognitive-psychology audit, the previously unsafe 1,575-character
paragraph is now one explicit original fallback; seven translations were
accepted, four additional outputs were rejected by the existing client quality
gate, and no request failed.


## Continuous audit checkpoint: v14 request-isolated cross-discipline run

The v14 audit completed the 21-paper catalog traversal through the same
independent `/translate` scheduler requests used by the reader. Nineteen cached
PDFs yielded 206 section-stratified paragraph samples (up to 12 per paper).
`wear-scale` and `precious-materials` were not locally cached, so they are
explicitly pending rather than counted as translation failures.

Of the 206 samples, the model returned Japanese for 197 and returned nine
explicit source fallbacks. The production quality gate would accept 151
translations (73.3% of all samples), would reject 46 model outputs, and would
keep 52 samples as original before model submission under the input policy.
There were no HTTP/request failures. These are automatic structural and
invariant results, not semantic-accuracy claims: the accepted queue still
requires manual source-versus-Japanese review.

The cached disciplines represented in this pass include HCI, human factors,
cognitive psychology/decision making, marketing/consumer behavior,
linguistics/computational linguistics, education, neuroscience, economics, and
machine learning. The most conservative outcomes occurred in the ACM and
cognitive/economics samples, where long technical or multi-clause blocks more
often reached either source fallback or the quality gate. This is expected from
the v14 change: it prefers a visible original over a fluent partial decode.

The next audit step is manual labeling of v14 automatic accepts, beginning with
long technical paragraphs and the formats that still produce source fallbacks.
No output-word blacklist or paper-specific rule was introduced from this run.


## Continuous audit checkpoint: source-fact addition guard

Manual review of the v14 automatic-accept queue found a severe false accept in a
wearable temperature-data paragraph: the Japanese output invented `100mm` and
`10mm`, neither of which occurred in the source. The quality gate now compares
structured source facts in both directions. It still permits ordinary number
localization, but rejects an output that adds a measurement, statistical value,
citation, DOI, or URL absent from the source. The existing 151 automatic accepts
were re-evaluated without re-running the model: two are now correctly rejected,
the temperature measurement case and a malformed reference/URL output. This
changes the cache identity to `semantic-v15`; old accepted cache entries cannot
bypass the new source-fact check.


The live v16 server was also exercised with a medium two-claim semicolon
sentence. It emitted two independent Japanese propositions, retaining both the
encoder-only limitation and the pretraining-noise robustness claim. The request
reported 221 input characters and 79 output characters; this is evidence of
unit-level behavior, not a paper-specific fixture.


## Continuous audit checkpoint: unit-isolated decoding

The v16 paper rerun showed that safe segmentation alone did not change an old
fluent omission when all sentence units of one paragraph were padded into one
`generate()` call. v17 therefore isolates every semantic unit at decode time,
not merely every reader request. This intentionally trades import throughput for
source fidelity. The scheduler and ordering remain unchanged, and the cache is
versioned `semantic-v17`.


## Continuous audit checkpoint: identifier token boundaries

The v17 audit exposed a quality-gate false accept: `BERT` was considered
preserved merely because the output contained `DeBERTa`. Acronym and technical
identifier invariants now use complete ASCII-token matching, while preserving
normal Japanese-adjacent identifiers and grant names. The live long paragraph is
now rejected with `scientific invariants missing: BERT`; this is cache version
`semantic-v18`.


Re-scoring the 151 formerly accepted cross-discipline outputs with v18 moved six
to original fallback: two source-fact additions and four missing technical
identifiers (`pF`, `OpenAI`/`API`, `BERT`, and `IV`). Inspection found no normal
wording variant among these six, so the boundary rule did not show an observed
false reject in this corpus slice.


## Continuous audit checkpoint: incomplete trailing clauses

A wearable-systems sample ended `albeit with` at a physical page boundary but
was previously sent as complete prose. The input policy now retains blocks ending
in an unfinished coordinator or preposition (`albeit`, `although`, `because`,
`with`, `without`, `including`, and related forms) until canonical paragraph
stitching can repair them. This prevents the model from inventing a missing
complement; cache version `semantic-v19`.


## Continuous audit checkpoint: power measurements

Scientific invariant coverage now includes micro-, milli-, and watt power
measurements. A long wearable-device abstract that omitted `14.4 uW` is rejected
rather than accepted as a fluent size-and-weight summary. Overlapping acronym and
measurement matches are deduplicated before scoring. Cache version: `semantic-v20`.


A second incomplete physical block ended `varying between` and its old Japanese
output invented a 100–1000 W range. Comparative tails `between` and `than` now
join the input guard, so the source is retained until a canonical continuation
exists. Cache version: `semantic-v21`.


A neuroscience result block ended `when a rule was`; its old translation
confidently completed the missing condition. Blocks ending in a bare auxiliary
or copula are now retained as source, since no complete English proposition can
end there. This is a generic physical-fragment guard.


Cache version `semantic-v22` includes the bare auxiliary/copula input guard, so
previously stored translations for physical fragments cannot bypass it.


## Continuous audit checkpoint: long unterminated prose

The remaining fragment failures shared a structural signature rather than a
paper-specific phrase: long body-like source (>400 characters) without a final
sentence mark. v23 preserves such text unless it is explicitly a list item. On
the cached corpus this moves 13 model-bound blocks to original fallback, avoiding
completion of missing page/column continuations.


The initial v23 scan found two legitimate long interview quotations that closed
with a quotation mark rather than a period. v24 exempts a fully closed quote
(optionally followed by a bracketed speaker/source) from the unterminated-prose
guard. The audit now blocks 11 physical fragments, while retaining those two
valid quotations.


## Continuous audit checkpoint: current-rule versus stale-output separation

Manual review reached 86 of 305 queued blocks. A severe Thermal Earring abstract
was previously recorded as an automatic accept, although its Japanese output changed
the device into an unrelated object and omitted both `14.4 uW` and the 28-day
battery-life claim. Re-evaluating that exact cached output with v24 returns
`scientific invariants missing: 14.4 uW, 28` and rejects it. This is evidence that
the source-fact gate repairs a historic cache failure; it is not evidence that the
current decoder produces a correct translation. Future comparisons must separately
report stale-cache re-scoring and fresh v24 inference.

A second Nature-style abstract contained inline publisher chrome and omitted two
result qualifications in an accepted Japanese output. It is recorded as a severity-3
false accept with primary cause `MADLAD decode` and secondary `line grouping`. The
manual audit therefore continues to prioritise multi-claim abstracts and inline
chrome cases. At this still-small review coverage, the provisional unsafe
false-accept rate is 62.8% (27 of 43 automatic accepts); it is a risk signal, not a
population estimate.


## Continuous audit checkpoint: marginal publication metadata

A Nature-format regression showed `Published: xx xx xxxx` at x=9 sharing a
baseline with body text beginning at x=155. The previous y-only line cluster merged
the two, yielding invalid source for translation. The layout stage now keeps a narrow
left-margin item separate when it is materially detached from a full-width body line,
and filters standalone received/accepted/published date metadata as chrome. The
actual neuroscience PDF reconstructs the abstract without the publication marker.
This is a geometry-plus-document-metadata rule; it does not depend on a paper title
or an output blacklist.


## Continuous audit checkpoint: sentence-level compression fallback

Fresh v24 inference of the repaired neuroscience abstract still omitted the full qualification that cathodal stimulation increased rule following even for rules requiring financial loss or harm. Debug logging showed a correctly segmented 114-character, 18-word sentence decoded to 30 compact Japanese characters (ratio 0.263). v25 applies a conservative per-unit compression guard for prose at least 110 compact characters and 18 words when its Japanese output falls below 0.27. The same fresh request now returns a source fallback through the scheduler, rather than a fluent partial translation. The cache identity is `semantic-v25`.


Two fresh v25 control translations remained accepted: a 116-character wearable-systems sentence retained both `Power-over-Skin` and `IBPT`, and a qualitative-research sentence retained both author-year citations. These controls do not establish broad recall, but they show that the unit-compression fallback did not blanket-reject concise valid translations in the tested range.


## Continuous audit checkpoint: remaining decode-time additions

Fresh v25 inference of an HCI classroom-procedure paragraph still transformed the source statement that a hand-out is distributed into invented experiment results, evaluation, and knowledge accumulation. Source segmentation was complete and the output was not anomalously short, so neither the structural input policy nor the compression guard applied. It is recorded as a severity-4 `MADLAD decode` failure. No output-word blacklist was added; the next viable direction is a general semantic-preservation check evaluated against diverse valid translations before it can be enabled.


## Experimental note: round-trip semantic audit

A Japanese-to-English round trip of the v25 HCI decode exposes unsupported repeated additions (`results`, `evaluation`, `knowledge`, `decision`) that are absent from the source. A qualitative-study control round-trips its six participants, life-story content, and author-year citations faithfully. This is a promising audit signal for semantic additions, but it is not yet a production gate: long reverse translations can truncate and lexical overlap alone cannot establish entailment. The next measurement is a stratified false-reject study before any enablement.


The first stratified round-trip test used five manual severity-0/1 accepts and five severity-2+ accepts. A naive repeated-new-English-token signal had 0/5 true positives and 2/5 false positives. It is therefore rejected as a production guard; the artifact is retained only as negative experimental evidence in `v25-roundtrip-stratified.json`.


## Continuous audit checkpoint: ASCII chi-square and decimal p-values

The neuroscience methods audit exposed a gap in scientific-token protection: `χ2(3)=0.37` was not treated as a statistic, and the p-value matcher protected only `p=0` from `p=0.83`. v26 protects both ASCII and superscript chi-square notation and the full decimal p-value in both the server placeholder layer and client invariant layer. This is a general statistical-notation repair, verified by Python and TypeScript regression tests.


A live v26 request on port 8766 returned `χ2(3)=0.37,p=0.83` unchanged inside Japanese prose, confirming placeholder protection and restoration in the actual MPS model process.


## Continuous audit checkpoint: comma-style figure captions

Older proceedings use `Fig. 1, Caption…` rather than a colon. The caption detector now recognizes that form only when the text after the comma begins a title-like uppercase continuation, while retaining `Figure 2, the body…` as ordinary prose. On the real Design for Wearability PDF, Figures 1–7 now resolve as figure captions; lowercase-start Figure 8 deliberately remains paragraph until geometry supplies sufficient evidence.


A fresh v26 production-path audit of Design for Wearability sampled 12 paragraph blocks and sent eight to MADLAD. Comma-style Figures 1–7 were absent from the paragraph sample after canonical extraction; only lowercase-start Figure 8 remained, as intended by the precision-first rule. The v26 build completed after this extraction change.


## OzCHI table verification

Canonical extraction of the OzCHI regression PDF found Table 1–5 as table-caption relations. Tables 1, 2, 4, and 5 have aligned native-text regions at confidence 0.96. Table 3 has a caption-only table fallback at confidence 0.48, but it remains a table node rather than paragraph translation input.


## OzCHI heading hierarchy verification

Canonical CHILD_OF relations on the real OzCHI PDF place Phonebook Application Design, User Study, and Results under STUDY II; Proof of concept implementation, User Study, and Results are under STUDY III. The unnumbered subheadings are therefore preserved as hierarchy rather than flattened to a single level.


## Cross-page paragraph regression coverage

The physical-page continuation logic now has explicit regression coverage for the OzCHI-shaped case where a page ends in `… One` and the next page begins `exception …`: it produces one canonical paragraph with pageStart/pageEnd preserved. A neighboring negative case proves that an uppercase independent paragraph remains separate. This keeps the source-side repair precision-first; unproven continuations still fall back to the original rather than being guessed by MADLAD.


## Source-structure preservation notice

The input policy was re-measured against all 19 cached PDFs: 571 of 1,141 extracted paragraph blocks are withheld before model submission, including 386 unterminated physical fragments. These counts include expected chrome and bibliography skips, so they do not measure translation failure. For the subset withheld specifically because page/column/table structure is unsafe, projection now records a reason and the reader shows that the original is being retained rather than guessed. Reference and publisher skips do not receive this warning. A real Step-to-Charge extraction confirmed the metadata reaches reader blocks.


## Benchmark annotation semantics

The extraction benchmark previously treated an empty `headingHierarchy` in a partial fixture as an assertion that the document had no hierarchy. This penalized valid resolver relations and reported a misleading 0.50 mean. Empty arrays now mean unannotated; only fixtures with one or more annotated relations contribute. The current hierarchy measurement is therefore OzCHI-only and 1.00, rather than a cross-domain conclusion.


## Table and equation routing audit

A fresh 19-PDF extraction audit found no case where a high-confidence native-geometry table or equation candidate was resolved back to a paragraph. Four `Table N shows …` hits were ordinary prose references to tables, not captions; retaining them as paragraphs avoids a text-only table false positive. This evidence supports the existing precision-first resolver threshold, but does not prove table-region recall beyond the currently annotated OzCHI fixture.


## Physical fragment completion guard

A fresh production-path economics audit found a concrete source-fidelity failure: the physical fragment `… previous Theo-` was sent to MADLAD and decoded as `Theo-Dener`, a word absent from the source. A second fragment began `function approximation …` and ended `set to`. The input policy now recognizes trailing partial words, dangling prepositions, and short lower-case unterminated continuations; it preserves those sources with a structural warning. It distinguishes them from complete capitalized purpose sentences such as `To evaluate …`. Re-running the same 12 samples under v26 sent four safe inputs; both failure inputs were pre-model original fallbacks, with no generated translation.

The real-paper benchmark was also corrected to apply the same pre-model policy as import. Earlier audit rows that translated unsafe fragments are not production-equivalent and must not be counted as MADLAD failures.

## Continuous audit checkpoint: structured statistical parentheticals

A fresh neuroscience production-path audit found that a fluent result could retain `p=0.03` while dropping the linked `Fig. 7b`, `Mann–Whitney U test`, and `U=307`. This was a source-fidelity failure that the former invariant set did not describe. v28 treats a parenthetical containing a figure reference or explicit statistic as one atomic evidence span before decoding; individual figure/panel labels and bare uppercase rank statistics (`U=`, `W=`, `H=`, `V=`) are also invariants in the client quality gate. The rule is structural rather than paper- or vocabulary-specific.

A live v28 request preserved the complete source parenthetical: `tDCS(Fig. 7b, Mann–Whitney U test, U=307, p=0.03)。` The surrounding English was translated to Japanese. A fresh 12-block neuroscience production-path benchmark returned the same complete parenthetical in block `b-54f766b4`, where v26 had returned only `tDCSp=0.03。`. This preserves the evidential relation and prevents stale v26 cache entries from being reused through the `3b-mt-v5-semantic-v28` cache identity. This is a structural-fact repair; semantic terminology quality, such as the appropriate Japanese rendering of “selfishness,” remains an independent manual-review concern.

## Continuous audit checkpoint: borderline unit compression

The same neuroscience result paragraph exposed a second, independent failure after structured evidence was protected: its final 233-character, 33-word sentence was decoded as a 55-character Japanese conclusion, omitting the contrast that participants remained more consistent with free choices under anodal stimulation. The existing per-unit compression guard used `<0.27`; the observed ratio was `0.275`, so it passed. v29 raises this narrow threshold to `<0.28` for only substantial natural-language units (at least 110 compact characters and 18 English words). The existing compact-but-substantive control continues to pass.

A live v29 request for that sentence returned the exact 233-character source with zero generated tokens. A fresh 12-block neuroscience production-path benchmark marks block `b-54f766b4` as an original fallback instead of accepting its compressed Japanese paragraph. The benchmark totals are 7 submitted, 4 pre-model structural fallbacks, 7 original fallbacks, and 4 accepted translations; the overlap is expected because some post-model fallbacks originate among the submitted blocks. This prioritizes source completeness over a plausible but incomplete result statement.

## Continuous audit checkpoint: plural figure references

The marketing corpus contains prose such as `Figures 3, 4, and 5`. The original structural-fact matcher covered singular `Fig.` / `Figure` labels only. v30 extends the same generic figure-reference pattern to plural `Figs.` / `Figures`; this is cache-versioned and regression-tested in both the server placeholder layer and client invariant gate. The rule preserves the label plus its first panel number, while the existing numeric invariants retain the remaining listed values. No wording- or paper-specific rule was introduced.

## Continuous audit checkpoint: computational-linguistics coverage

A fresh v30 audit of the computational-linguistics / formal-language paper sampled 12 blocks: 10 were submitted, 2 were pre-model structural fallbacks, 5 used original fallback, and 6 translated outputs were accepted. CFG, NT, formulas, numerical labels, and list prefixes remained source-aligned in the sampled outputs. Manual review also found an accepted omission in `b-dd2088ed`: the rhetorical but meaningful opening sentence about examining attention patterns was absent while the following mechanism sentence remained. It is recorded as an unresolved decode-time omission. No broad short-sentence fallback was enabled from this single case, because that would need a stratified false-reject measurement across ordinary short academic sentences.

## Continuous audit checkpoint: abbreviation suffix boundary bug

The computational-linguistics omission was traced to the segmenter, not an unavoidable short-sentence decode: the prior abbreviation detector used suffix matching, so `mechanisms.` ended in `ms.` and was misclassified as the title abbreviation `Ms.`. The following sentence was then merged into one 272-character model input and its opening claim was omitted. v31 matches complete final tokens only; real abbreviations such as `e.g.` and `Ms.` remain protected, while ordinary words ending in the same letters produce a sentence boundary. A regression test covers `mechanisms. We …`; this is a language-general tokenizer repair, not an article-specific rule.

## Audit coverage note: ergonomics extraction-limited paper

The cached arXiv human-factors paper produced only one sampled paragraph candidate, an incomplete page-1 sentence: `Starting from … this paper analyzes … characteristics`. It was correctly withheld by the pre-model policy and no Japanese text was generated. This is evidence that incomplete extraction does not trigger model completion, but it is not a usable translation-quality sample. It is excluded from v31 discipline-quality conclusions and retained as an extraction-limited corpus item pending a separate reading-order investigation.

## Continuous audit checkpoint: cognitive-psychology v31 coverage

The v31 cognitive-psychology audit sampled 12 blocks: 8 model submissions, 4 pre-model source fallbacks, 7 original fallbacks in total, and 2 accepted translations. The accepted GPT-3/SI blocks preserved the sampled identifiers and numeric facts. The fallback count is not a semantic-error rate: it includes intentional source echoes after server-side safety rejection. This corpus remains useful for manual semantic review, but the present evidence does not justify loosening its source-completeness policy.

## Continuous audit checkpoint: HCI empirical-methods v31 coverage

The v31 HCI empirical-methods audit sampled 12 blocks: 9 model submissions, 3 pre-model source fallbacks, 3 original fallbacks, and 7 accepted translations. This mixed-layout empirical paper exercised procedure prose, participant descriptions, citations, and multi-column source reconstruction. It is a production-path sample only; accepted output remains queued for manual semantic review rather than being treated as a proof of equivalence.

## Continuous audit checkpoint: education / learning-analytics v31 coverage

The v31 education-learning-analytics audit sampled 12 blocks: 8 model submissions, 4 pre-model source fallbacks, 5 original fallbacks, and 7 accepted translations. This adds a single-column education format with tables, figures, and learning-procedure prose to the current production-path coverage. As elsewhere, accepted rows remain a manual semantic-review queue; the automatic acceptance count does not claim semantic equivalence.

## Continuous audit checkpoint: design-for-wearability v31 coverage

The v31 design-for-wearability audit sampled 12 blocks: 8 model submissions, 4 pre-model source fallbacks, 4 original fallbacks, and 8 accepted translations. Caption-shaped Figure 1–7 material remained outside paragraph translation after canonical extraction; one remaining Figure-shaped paragraph candidate was retained for manual review rather than used as evidence of universal caption recall. This confirms the precision-first routing behavior on a figure-heavy design PDF without claiming complete caption coverage.

## v31 full cached-corpus production run

The v31 production-path run completed for all 21 catalog entries (19 cached PDFs plus two explicit cache-missing entries). The generated aggregate report is `test-data/real-papers/reports/translation-audit.{json,md}`. Its automatic counts are an operational safety measurement, not semantic ground truth: source fallbacks include intentional protection against unsafe inputs and decoder-quality failures. The remaining high-value work is manual semantic review of accepted rows and investigation of extraction-limited PDFs; no automatic accept count is reported as a correctness rate.

## Continuous audit checkpoint: manual-review population and v33 structural safety

The manual-review queue was corrected to use only the completed whole-corpus report. Earlier per-paper checkpoint reports were from prior pipeline versions and must not be counted as current translations. Human annotations are retained only when paper, block, and source identity match; the current source, translation, and production decision are never overwritten by an old record.

The current v31 report contains 19 cached papers, 206 sampled blocks, and 85 automatic accepts. Manual comparison now covers 66 blocks overall and 33 current automatic accepts; 15 of those 33 accepts have severity 2 or greater (45.5%). This is a provisional, intentionally risk-oriented review sample, not a corpus-wide error-rate estimate. It demonstrates that automatic acceptance is still insufficient evidence of research fidelity.

Three general source-boundary failures were found in currently accepted output: a paragraph ending in `as` elicited an invented battery-life claim; clipped statistical prose ending in `and standard` was completed as a statement; and an unterminated quotation/parenthesis was translated as if complete. v33 treats trailing `as`, dangling statistical labels, and unmatched parentheses or quotation marks in nonterminal physical blocks as structural uncertainty and preserves the original. It also routes nonterminal mixed Korean-plus-English department/university affiliation lines as expected metadata. These are syntax and document-role rules, not paper- or output-word blacklists. The client cache identity and server segmenter version are both `3b-mt-v5-semantic-v33`.

## Continuous audit checkpoint: v34 calendar-year invariant

Manual review found a v31 automatic accept that rewrote `Prior to World War I` as an invented `1914年に発表された「時計の歴史」`; the source's actual calendar year was 1979. The prior guard recognized only ISO-like dates, and ordinary four-digit years were excluded from unexpected-fact comparison. v34 adds calendar years (1500–2099) as a protected invariant: output must retain source years and cannot introduce another year. A regression test confirms that a Japanese output retaining 1979 but adding 1914 is rejected. This catches a factual class rather than a particular phrase, while semantic substitutions with no durable source fact remain an unresolved decoder-quality limitation.

## Continuous audit checkpoint: v34-independent review and v35 incomplete introductions

Manual-review annotations are now tied to both pipeline version and exact translated output. A source/block match alone no longer carries a v31 judgment into a v34 result. The v34 production report contains 78 automatic accepts (down from 85 in v31), 74 pre-model fallbacks, and 54 post-model fallbacks across the 206 cached-corpus blocks. The v34 review starts as an independent sample; its first 17 cross-discipline accepts include 8 severity-2-or-higher failures.

One v34 false accept was a physical block ending `We present Thermal`. It translated the preceding complete sentences and silently discarded that uncompleted introduction. v35 classifies a nonterminal academic introducing verb followed only by the first capitalized name token as a structurally incomplete paragraph, so it retains source rather than asking MADLAD to infer the missing noun phrase. The rule is generic to `present/propose/introduce/develop/describe/evaluate/demonstrate/call`, is regression-tested, and does not reference a paper title.

## Continuous audit checkpoint: v36 chrome, panel, and delimiter boundaries

The first v35 review stratum found three source shapes that were accepted despite not being independent prose: a running header ending in a publisher page marker (`• 195:3`), a panel-caption fragment beginning `(b)`, and a definition/equation introduction ending in `:`. v36 classifies the first as expected non-prose and the latter two as structural uncertainty. All preserve the native source rather than allowing the decoder to silently omit the structural token or hallucinate the missing continuation. Tests cover each shape and retain normal completed prose. The next corpus run must measure the resulting false-accept reduction separately from the increased fallback count.

## v36 full cached-corpus production run

The v36 production-path run completed on 2026-09-12 against the local MADLAD endpoint `http://127.0.0.1:8766`. It covered 19 cached PDFs from the 21-entry catalog and 206 sampled blocks. Production decisions were: 72 automatic accepts, 80 pre-model structural/source fallbacks, and 54 post-model quality fallbacks. There were no failed requests. Compared with v35's 77 automatic accepts, v36 moved five additional rows out of the accept population; this is a source-fidelity improvement only for the affected structural cases, not proof that the remaining accepts are semantically correct.

The manual-review queue was regenerated from the v36 whole-corpus report. Fourteen exact source/translation comparisons carried forward; six of those fourteen current automatic accepts still have severity 2 or greater, for a provisional unsafe false-accept rate of 42.9% within the reviewed stratum. The reviewed failures are dominated by semantic shift and omission rather than explicit numeric, citation, or hallucinated-fact violations. This confirms the present boundary of the guard design: structural and invariant checks prevent many unsupported facts and damaged-source completions, but they do not yet prove semantic equivalence for fluent Japanese that contains no durable source facts.

Next work should focus on a generic semantic-drift signal that does not rely on banned word blacklists or paper-specific expectations. Candidate directions are sentence-level source/target coverage features, terminology preservation for content nouns and acronyms, and a conservative retry/fallback path for translations that compress or omit independent source sentences while passing invariant checks. The corpus should also expand beyond the current 19 cached PDFs before treating any rate as representative.

## Continuous audit checkpoint: v38 panel and comparison invariants

Manual review of v36 false accepts exposed two missing structural facts: a figure panel reference `Figure 1(a)` was reduced to `Figure 1`, and a statistical/model-comparison condition `(where y ̸= 0 when x = 0)` was omitted. v38 treats parenthesized figure panels and single-letter variable comparisons as scientific invariants in both the client quality gate and server-side placeholder protection. This is generic to academic references and mathematical conditions; it does not depend on the Speechin or marketing papers.

The first v37 verification also found that MADLAD can mutate placeholder glyphs, producing a leftover `ZZCΙT2ZZ` with a Greek capital iota in place of ASCII `I`. v38 normalizes common Latin-lookalike glyphs during placeholder restoration and rejects any leftover scientific placeholder on the client side. Regression tests cover both the server restoration and the client degenerate-output guard.

The v38 production-path run completed on 2026-09-12 against `http://127.0.0.1:8766`: 19 cached PDFs, 206 sampled blocks, 126 model submissions, 80 pre-model fallbacks, 54 post-model fallbacks, 108 original fallbacks, and 72 automatic accepts. The aggregate accept count is unchanged from v36, but the affected outputs now retain `Figure 1(a)` and `(where y ̸= 0 when x = 0)`. After regenerating the manual-review queue, 12 exact source/translation comparisons carried forward; four of those twelve current accepts remain severity 2 or greater, giving a provisional reviewed unsafe false-accept rate of 33.3%.

The remaining reviewed severe accepts are still mostly semantic shifts and omissions without stable numeric/citation facts. The next algorithmic target should therefore be a source/target coverage signal that detects dropped independent clauses or content terms without relying on output-word blacklists.

## Product target: fallback below 5%

The product target is now stricter than the earlier safety-first audit posture: reader-visible fallback should be below 5% for ordinary body prose while keeping unsafe false accepts near zero. A fallback-heavy system can be safer than a hallucinating one, but it is not a successful reading product if researchers repeatedly hit untranslated paragraphs. Future measurements must therefore separate body-prose fallback from intentional non-prose skips such as references, publisher chrome, tables, captions, equations, and damaged extraction.

Reaching this target likely requires a translation-engine comparison or cascade, not only tighter guards around MADLAD. The next benchmark layer should evaluate current MADLAD against candidate local/free-use English-to-Japanese engines on the same protected semantic units, then route each unit through the engine that best preserves source facts and sentence coverage. Any external or paid API option must be checked for free-tier availability before use; local/open-weight models remain the default candidate class.

## Continuous audit checkpoint: v39 fallback target and local model comparison

The product target now measures ordinary body prose separately from references, chrome, damaged extraction, captions, tables, and statistical prose. A fresh v39 production-path run completed on 2026-09-12 against `http://127.0.0.1:8766`: 21 catalog entries, 206 sampled blocks, 75 ordinary-body-prose rows, and 20 ordinary-body reader-visible fallbacks. Ordinary-body fallback is therefore 26.7%, still far above the 5% product target. All ordinary-body fallbacks are post-model failures; pre-model structure filtering is not the bottleneck for normal body prose in this run.

The v39 retry path adds rescue-only segmentation for two patterns observed to be recoverable without weakening the quality gate: coordinated `found that A and that B` findings, and top-level `; if so,` questions. A more aggressive rescue for `where ...` property clauses and appositive `a region ...` clauses was tested live and deliberately not enabled: it reduced fallback but produced unsafe semantic drift such as replacing receiver property lists with invented power-management claims. This is exactly the failure mode the product target forbids.

Local/free model comparison was started with Hugging Face open models. `Helsinki-NLP/opus-mt-en-jap` is Apache-2.0 and local/free, but failed the fallback-candidate test: after adding a fragmented-Japanese decoder-artifact guard, 0/20 ordinary-body fallbacks were acceptable. `facebook/m2m100_418M` and `facebook/m2m100_1.2B` are MIT-licensed local/free candidates and produced more fluent output, but manual spot checks still showed semantic drift and omissions. The 1.2B model passed the current automatic gate on 4/10 sampled MADLAD fallback rows, but this is not sufficient for production cascade because examples with statistics and terminology remain unsafe. Raw comparison outputs are saved in `test-data/real-papers/reports/model-cascade-*.json`, and the reusable harness is `translation-server/scripts/compare_fallback_model.py`.

The next blocker is not measuring categories anymore; it is semantic coverage. The next implementation should score whether independent source claims and content terms survive translation, then use that score to choose between MADLAD, retry segmentation, and any alternate local model. No external paid API has been added; any future external service must be rechecked for free-tier availability before testing.

## Continuous audit checkpoint: v40 reader-visible fallback and semantic coverage signal

The benchmark definition was corrected to separate server source echo from reader-visible fallback. The previous v39 figure of 26.7% ordinary-body fallback counted only rows where the server returned the source. It missed rows where the server produced Japanese but the client quality gate would reject it and show the original to the reader. The v40 report now records `readerVisibleFallback` and uses it for source-category summaries.

A fresh v40 run completed on 2026-09-13 local time against `http://127.0.0.1:8766`. It covered 21 catalog entries and 206 sampled blocks. Ordinary body prose has 75 rows, with 35 reader-visible fallbacks, all post-model. The correct ordinary-body fallback rate is therefore 46.7%, not 26.7%. This makes the product gap clearer: the current bottleneck is not pre-model input filtering, but translation recovery after MADLAD or the client gate fails.

A local/free semantic-coverage audit signal was added in `translation-server/scripts/evaluate_semantic_coverage.py`. It uses `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` through the existing Transformers stack and the production segmenter for source units. This signal is not a production gate. On 12 manually reviewed v40 accepts, safe rows had average minimum source-sentence similarity around 0.777, while severity-2+ rows averaged around 0.721. The separation is useful for review prioritization but too weak for hard rejection without causing false fallback. Full accept scores are saved in `test-data/real-papers/reports/semantic-coverage-accepts-v40.json`.

A candidate hard rule for orphaned invariant-only Japanese sentences was tested and intentionally kept as an audit reason rather than a production reject. As a hard gate it would reject common citation formatting such as a Japanese sentence followed by `[11]`, increasing reader-visible fallback instead of improving the product. The next step is to label low-coverage accepted rows manually and calibrate a content-coverage/cascade policy that reduces unsafe accepts without pushing ordinary-body fallback even higher.

## Handoff checkpoint: v49 stopped intentionally

Work was paused at the user's request with the pipeline/cache identity at `3b-mt-v5-semantic-v49`. All long-running processes were stopped after the pause request; no `tsx`, benchmark, translation-server, MADLAD, or Python server process remained after shutdown verification.

The latest completed full-corpus benchmark is v48, not v49. v48 covered 21 catalog entries, 19 cached PDFs, and 206 sampled rows. Ordinary body prose had 74 rows, 60 automatic accepts, and 14 reader-visible fallbacks, so the ordinary-body fallback rate was 18.9%. This is a real improvement over v43's 47.3%, but still above the 5% product target.

v49 adds a placeholder-leak guard for mutated scientific placeholders such as `ΖZCIt2ZZ`. Its unit tests, TypeScript check, and Python translation-server tests passed, but the v49 full benchmark was interrupted at 17 completed paper checkpoints and the report has `complete: false`. Do not use the partial v49 report as the authoritative corpus rate; rerun v49 to completion before comparing metrics.

The next audit step should add an explicit partial-source-fallback metric. v48's micro-batcher can preserve only failed translation units as exact English source inside an otherwise Japanese paragraph. That is safer than a hallucinated Japanese sentence, but it is not equivalent to a fully translated paragraph and should be measured separately before claiming product-readiness progress toward the 5% fallback target.

## Server-ready resume fix

A saved import/translation can now recover when the PDF was added before MADLAD was reachable. The ready hook scans persisted papers from the database, not only the in-memory library cache, and resumes papers that are still `translating`, `queued`, or `glossary`, plus `partial`/`failed`/`ready` papers that still have pending title, section, or retryable paragraph translation work. The app also keeps a low-frequency health poll after the initial 90-second sidecar wait fails, so a later successful server startup still fires the resume path without requiring the reader page to be opened. `resumeIncompleteTranslation()` now uses the configured `translationConcurrency` instead of hard-coding 8.

Verification passed: `npx vitest run src/test/importResumeServerReady.test.ts src/test/quality.test.ts src/test/resumeTranslation.test.ts`, `npx tsc --noEmit --pretty false`, and `npm run lint` with existing warnings only. A manual app-level check is still recommended: add a PDF while the translation server is unavailable, let the server become ready, and confirm the saved paper resumes translation from the library/project view.

## Handoff checkpoint: v50 stopped at user-requested paper checkpoint

The v50 current-source server was started on `http://127.0.0.1:8766` because the running `.app` server on 8765 reported the old `3b-mt-v5-semantic-v1` bundle. v50 changes the unit-level compression guard so a rescue-translated single claim may omit a leading reporting frame such as `Among other things they found that` without being rejected solely for length. The rule does not apply while the source still contains a coordinated `and that` claim, preserving the previous safety behavior for one-claim omissions.

Spot check: `interactive-jewellery b-828da077` changed from v49 `partialSourceFallback=true` with a 46-word English source span left inside accepted Japanese, to v50 `partialSourceFallback=false` with the rescued claims translated into Japanese. This improves readable output without counting hidden English source fallback as a full accept.

The full v50 benchmark was then started and stopped at the user's request after a clean paper checkpoint. The incomplete report currently has 6 completed paper checkpoints, 62 rows, and 3 `partialSourceFallback` rows; `complete` is `false`, so it is not an authoritative whole-corpus rate. The v50 dev server and benchmark process were stopped. The user's `.app` translation-server process was left running because it belongs to the open app, not this benchmark run.
