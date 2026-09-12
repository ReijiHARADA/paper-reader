
## Continuous audit checkpoint: overlong safe clauses

The semantic segmenter now splits a sentence at a semicolon only when the
whole unit exceeds 360 characters and both resulting top-level clauses contain
at least 100 characters. Parenthetical scientific/author-year citation spans
are masked first, so their semicolons remain unsplittable. This addresses
long one-sentence descriptions such as the `Traces` figure-text regression,
where greedy decoding had omitted the latter clause, without restoring the old
unsafe “split every semicolon” behavior. Python segmenter/server tests: 32;
TypeScript quality tests: 36; production web build: passed.


## Continuous audit checkpoint: independent semicolon claims

A v15 source/translation comparison showed that punctuation-aware sentence
splitting alone was insufficient for a medium-length sentence containing two
independent claims joined by a top-level semicolon. The segmenter now separates
only such clauses when the full unit exceeds 220 characters and each side has
substantial prose (at least 90/80 characters). Protected citation spans remain
masked, so author-year reference lists cannot become translation fragments. The
regression asserts both round-trip reconstruction and separation of the two
claims. This is cache version `semantic-v16`.
