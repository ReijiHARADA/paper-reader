"""Semantic translation-unit segmentation shared by production and benchmarks.

This is deliberately a scanner, rather than a sentence-splitting regex: PDF
paragraphs contain decimals, abbreviations and author-year citations where a
period or semicolon is not a translation boundary.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .citation_protect import protected_span_mask

SEGMENTER_VERSION = "semantic-v50"
_ABBREVIATIONS = {"e.g.", "i.e.", "et al.", "fig.", "no.", "cf.", "dr.", "mr.", "ms.", "vs."}


@dataclass(frozen=True)
class TranslationUnit:
    # Exact source slice. Joining ``text`` values must reconstruct the source.
    text: str
    protected: str
    # A minimally completed form sent to the model. It may differ only when a
    # relative clause needs its antecedent made explicit for independent
    # translation; source reconstruction always uses ``text``.
    model_input: str


def _compact(text: str) -> str:
    return " ".join(text.split()).strip()


def _normalize_model_input(text: str) -> str:
    """Repair high-confidence OCR/apostrophe losses only for model input.

    The source slice must remain byte-for-byte reconstructable modulo
    whitespace, but MADLAD is sensitive to malformed English such as interview
    quotes beginning with ``Its not``.  Restrict repairs to unambiguous
    pronoun contractions before negation so possessive ``its`` remains intact.
    """
    normalized = re.sub(r"\bIts\s+(?=not\b)", "It's ", text)
    # PDF text and scholarly prose sometimes insert a comma into
    # neither/nor coordination.  MADLAD has repeatedly dropped the whole
    # negative predicate from inputs like ``Neither cathodal, nor anodal ...``.
    # Removing only that optional comma preserves the logical form while
    # presenting the standard English construction to the model.
    normalized = re.sub(r"\bNeither\s+([^,.;:()]{1,80}),\s+nor\b", r"Neither \1 nor", normalized, flags=re.I)
    return normalized


def _is_decimal(text: str, index: int) -> bool:
    return index > 0 and index + 1 < len(text) and text[index - 1].isdigit() and text[index + 1].isdigit()


def _is_abbreviation(text: str, index: int) -> bool:
    # Match the complete final token. A suffix check made ordinary words such
    # as ``mechanisms.`` look like the abbreviation ``ms.``, hiding a real
    # boundary and making the following sentence vulnerable to omission.
    prefix = text[: index + 1]
    # Experimental labels such as ``person B. Neither ...`` are sentence
    # endings, not author initials.  Treating the final label as an
    # abbreviation merges the following sentence into the same model input;
    # MADLAD then tends to omit the second claim.
    if re.search(r"\b(?:person|participant|option|condition|group|box|target|stimulus|case|class|category)\s+[A-Z]\.$", prefix, re.I):
        return False
    token = re.search(r"(?:^|\s)([A-Za-z]+(?:\.[A-Za-z]+)*\.)$", prefix)
    return bool(token and token.group(1).lower() in _ABBREVIATIONS) or bool(re.search(r"\b[A-Z]\.$", prefix))


def _advance_quote_state(quote: str | None, char: str) -> str | None:
    """Track straight and typographic quotation pairs without leaking state.

    Native PDF text routinely uses curly opening/closing marks.  Treating
    `“` and `”` as independent toggles leaves the scanner in quote mode for
    the remainder of a paragraph, suppressing every later sentence boundary.
    """
    if char in '\"\'':
        return None if quote == char else char
    if char in "“‘":
        return char
    if char == "”":
        return None if quote == "“" else quote
    if char == "’":
        return None if quote == "‘" else quote
    return quote


def _is_quote_marker(text: str, index: int) -> bool:
    char = text[index]
    if char not in '\"\'“”‘’':
        return False
    # An ASCII apostrophe inside a word is a contraction/possessive, not an
    # opening quote (for example, "doesn't" or "model's").
    if char == "'" and 0 < index < len(text) - 1:
        return not (text[index - 1].isalnum() and text[index + 1].isalnum())
    return True


def _boundary_positions(text: str) -> list[int]:
    positions: list[int] = []
    paren = square = brace = 0
    quote: str | None = None
    for i, char in enumerate(text):
        if _is_quote_marker(text, i):
            quote = _advance_quote_state(quote, char)
            continue
        if quote:
            continue
        if char == "(": paren += 1
        elif char == ")": paren = max(0, paren - 1)
        elif char == "[": square += 1
        elif char == "]": square = max(0, square - 1)
        elif char == "{": brace += 1
        elif char == "}": brace = max(0, brace - 1)
        elif char in ".!?" and not (paren or square or brace):
            if char == "." and (_is_decimal(text, i) or _is_abbreviation(text, i)):
                continue
            if i + 1 == len(text) or text[i + 1].isspace():
                positions.append(i + 1)
    return positions


def _merge_fragments(parts: list[str]) -> list[str]:
    merged: list[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        words = part.split()
        # A top-level terminal punctuation mark already establishes a safer
        # boundary than a word such as ``But`` or ``To``.  Both are valid
        # starts for a complete academic sentence or question.  Physical PDF
        # continuations lack that preceding terminal punctuation and should be
        # repaired upstream; merging complete sentences here made model inputs
        # unnecessarily long and caused omissions.  Only truly tiny fragments
        # and standalone author-year references are merged.
        fragment = len(words) < 4 or re.fullmatch(r"[^A-Za-z]*[A-Za-z]+(?:\s+et al\.)?,?\s*\d{4};?", part)
        if fragment and merged:
            merged[-1] = f"{merged[-1]} {part}"
        else:
            merged.append(part)
    return merged


def _split_list_items(text: str) -> list[str]:
    """Keep visually flattened PDF lists from becoming one model input.

    Native PDF extraction can reconstruct bullets as a single paragraph. Keep
    any lead-in sentence as its own unit, then preserve each bullet as a unit;
    omitting that lead-in would silently change the source before translation.
    """
    bullet_positions: list[int] = []
    for match in re.finditer(r"(?:^|\s)[•‣▪∙]\s+", text):
        # A match after whitespace starts at that whitespace; retain the bullet
        # itself so the joining stage can restore list structure.
        position = match.start()
        if position < len(text) and text[position].isspace():
            position += 1
        bullet_positions.append(position)
    if len(bullet_positions) < 2:
        return [text]
    boundaries = [0, *[position for position in bullet_positions if position > 0], len(text)]
    return [text[left:right].strip() for left, right in zip(boundaries, boundaries[1:]) if text[left:right].strip()]


def _split_inline_enumeration(text: str) -> list[str]:
    """Separate a prose lead-in from a flattened numbered inline list.

    Native PDF extraction can turn ``(1) …; (2) …; (3) …`` into a single
    model input. Greedy decoding then tends to omit the middle conditions.
    Require at least two ordinal markers so equations and ordinary
    parenthetical numbers remain part of their surrounding sentence.
    """
    markers = list(re.finditer(r"\(\d{1,2}\)", text))
    if len(markers) < 2:
        return [text]
    starts = [0, *[match.start() for match in markers]]
    ends = [*starts[1:], len(text)]
    return [text[left:right].strip() for left, right in zip(starts, ends) if text[left:right].strip()]


def _split_overlong_safe_clauses(text: str) -> list[str]:
    """Split only genuinely overlong prose at a top-level semicolon.

    Semicolons are not ordinary sentence boundaries.  They become useful only
    when a single unit is long enough to cause greedy omissions and both sides
    are substantial clauses. Protected citation spans are masked first, so an
    author-year citation list can never supply the split point.
    """
    # A semicolon can join two independent research claims well below the
    # model's context limit.  Leaving those together lets greedy decoding keep
    # the first claim while silently dropping the second.  Citation spans are
    # already masked and short rhetorical clauses remain intact below.
    if len(text) <= 220:
        return [text]
    masked = protected_span_mask(text)
    candidates: list[int] = []
    paren = square = brace = 0
    quote: str | None = None
    for i, char in enumerate(masked):
        if _is_quote_marker(masked, i):
            quote = _advance_quote_state(quote, char)
            continue
        if quote:
            continue
        if char == "(": paren += 1
        elif char == ")": paren = max(0, paren - 1)
        elif char == "[": square += 1
        elif char == "]": square = max(0, square - 1)
        elif char == "{": brace += 1
        elif char == "}": brace = max(0, brace - 1)
        elif char == ";" and not (paren or square or brace):
            if i >= 90 and len(text) - i - 1 >= 80:
                candidates.append(i + 1)
    if not candidates:
        # Figure/artwork captions often start with a short quoted title and a
        # figure marker, then use one semicolon before a much longer material
        # description. This is structurally different from prose: preserving
        # the title phrase as its own unit keeps greedy decoding from dropping
        # the latter description. Do not generalize this to arbitrary short
        # semicolon clauses.
        lead = re.match(r"^[\"“‘][^\"”’]{1,100}[\"”’]\s*\((?:fig(?:ure)?\.?\s*\d+[A-Za-z]?)\)[^;]{0,120};", text, re.I)
        if lead and len(text) - lead.end() >= 120:
            return [text[:lead.end()].strip(), text[lead.end():].strip()]
        return [text]
    split = min(candidates, key=lambda index: abs(len(text) / 2 - index))
    return [text[:split].strip(), text[split:].strip()]


def _complete_long_colon_predicate_list(text: str) -> list[tuple[str, str]]:
    """Split a long ``Model: it does …, does …`` predicate list safely.

    Greedy decoding commonly translates only the first predicate after a
    colon.  This is distinct from ordinary comma prose: require an explicit
    technical/model subject and at least three substantial coordinated
    predicates.  Source slices retain every comma; only the model-facing form
    repeats the already-mentioned subject so each predicate is grammatical in
    isolation.
    """
    if len(text) < 240:
        return [(text, text)]
    masked = protected_span_mask(text)
    colon = next((i for i, char in enumerate(masked) if char == ":"), -1)
    if colon < 50 or len(text) - colon < 150:
        return [(text, text)]
    prefix, tail = text[: colon + 1].strip(), text[colon + 1 :].strip()
    subjects = re.findall(r"\b(?:[A-Z]{2,}[A-Za-z0-9-]*|[A-Z][A-Za-z]*-\d+)\b", prefix)
    if not subjects:
        return [(text, text)]
    subject = subjects[-1]
    # Only predicate lists headed by a pronoun or verb are completed.  A
    # colon introducing a definition, a citation, or a table stays intact.
    if not re.match(r"(?:it\s+)?(?:is\s+able\s+to|[a-z]+(?:s|es)\b)", tail, re.I):
        return [(text, text)]
    spans: list[tuple[int, int]] = []
    start = 0
    paren = square = brace = 0
    for i, char in enumerate(protected_span_mask(tail)):
        if char == "(": paren += 1
        elif char == ")": paren = max(0, paren - 1)
        elif char == "[": square += 1
        elif char == "]": square = max(0, square - 1)
        elif char == "{": brace += 1
        elif char == "}": brace = max(0, brace - 1)
        elif char == "," and not (paren or square or brace):
            spans.append((start, i + 1))
            start = i + 1
    spans.append((start, len(tail)))
    pieces = [tail[left:right].strip() for left, right in spans if tail[left:right].strip()]
    if len(pieces) < 3 or any(len(piece) < 30 for piece in pieces):
        return [(text, text)]
    completed: list[tuple[str, str]] = [(prefix, prefix.rstrip(":") + ".")]
    for piece in pieces:
        predicate = piece.rstrip(",.").strip()
        predicate = re.sub(r"^(?:it\s+|and\s+)", "", predicate, flags=re.I)
        if not re.match(r"(?:is\s+able\s+to|[a-z]+(?:s|es)\b)", predicate, re.I):
            return [(text, text)]
        completed.append((piece, f"{subject} {predicate}."))
    return completed


def _complete_long_relative_clause(text: str) -> list[tuple[str, str]]:
    """Make a long relative clause independently translatable without editing source.

    A model often drops the content after ``..., in which participants ...``
    when the full sentence is long.  The relative clause is semantically
    dependent, so emitting it as bare ``in which ...`` is also unsafe.  Keep
    exact source slices for reconstruction but send the second unit as ``In
    this context, participants ...``.  The antecedent is already translated
    by the preceding unit and no paper-specific fact is introduced.
    """
    if len(text) < 220:
        return [(text, text)]
    match = re.search(
        r",\s+(in\s+which)\s+(participants\s+(?:are|were)\s+(?:asked|shown|given|told)\b.+)$",
        text,
        re.IGNORECASE,
    )
    if not match:
        return [(text, text)]
    prefix = text[: match.start() + 1].strip()
    clause = text[match.start() + 1 :].strip()
    body = match.group(2).strip()
    if len(prefix) < 70 or len(clause) < 90:
        return [(text, text)]
    # Restrict the antecedent to common scholarly entities. This avoids
    # recasting arbitrary prose merely because it contains a relative clause.
    if not re.search(r"\b(?:problem|task|study|experiment|method|model|system|case)\b", prefix, re.I):
        return [(text, text)]
    return [
        (prefix, prefix.rstrip(",") + "."),
        (clause, f"In this context, {body}"),
    ]


def _split_rescue_at(text: str, index: int, left_model: str, right_model: str) -> list[TranslationUnit]:
    left = text[:index].strip()
    right = text[index:].strip()
    if not left or not right:
        return []
    return [
        TranslationUnit(left, protected_span_mask(left), left_model),
        TranslationUnit(right, protected_span_mask(right), right_model),
    ]


def _rescue_found_that_coordination(text: str) -> list[TranslationUnit]:
    """Recover ``found that A and that B`` units after greedy omission.

    Production segmentation keeps these sentences intact because the source is
    grammatical.  If MADLAD later drops one coordinated finding, the retry can
    make each finding explicit without changing the source slices that will be
    rejoined.
    """
    if len(text) < 180:
        return []
    masked = protected_span_mask(text)
    match = re.search(r"\bfound\s+that\b", masked, re.I)
    if not match:
        return []
    split = re.search(r"\s+and\s+that\s+", masked[match.end():], re.I)
    if not split:
        return []
    split_index = match.end() + split.start()
    left = text[:split_index].strip()
    right = text[split_index:].strip()
    if len(left) < 80 or len(right) < 80:
        return []
    right_body = re.sub(r"^and\s+that\s+", "", right, flags=re.I).strip()
    return _split_rescue_at(
        text,
        split_index,
        left.rstrip(",;") + ".",
        "They found that " + right_body,
    )


def _rescue_if_so_semicolon(text: str) -> list[TranslationUnit]:
    """Split a question with a top-level ``; if so,`` continuation."""
    masked = protected_span_mask(text)
    match = re.search(r";\s+if\s+so,\s+", masked, re.I)
    if not match:
        return []
    left = text[: match.start()].strip()
    right = text[match.start() + 1 :].strip()
    if len(left.split()) < 8 or len(right.split()) < 8:
        return []
    return _split_rescue_at(
        text,
        match.start() + 1,
        left.rstrip(",;") + ".",
        right[0].upper() + right[1:] if right else right,
    )


def _rescue_nonrestrictive_where_clause(text: str) -> list[TranslationUnit]:
    """Make concise ``..., where property list ...`` clauses explicit.

    These clauses are frequent in methods prose.  MADLAD often summarizes the
    main clause and omits the property list; retrying the second slice as
    ``In this context, ...`` keeps the fact-bearing clause available while the
    exact source text remains reconstructable.
    """
    if len(text) < 100:
        return []
    match = re.search(r",\s+(where\s+[^.?!]+[.?!]?)$", text, re.I)
    if not match:
        return []
    prefix = text[: match.start() + 1].strip()
    clause = text[match.start() + 1 :].strip()
    body = re.sub(r"^where\s+", "", clause, flags=re.I).strip()
    if len(prefix.split()) < 8 or len(body.split()) < 6:
        return []
    # Favor fact-heavy property clauses; avoid rewriting arbitrary narrative.
    if not re.search(r"\b(?:size|weight|form factor|power|efficiency|rate|temperature|accuracy|latency|performance|value|condition|participants?)\b", body, re.I):
        return []
    return _split_rescue_at(
        text,
        match.start() + 1,
        prefix.rstrip(",") + ".",
        "In this context, " + body,
    )


def _rescue_appositive_region_clause(text: str) -> list[TranslationUnit]:
    """Split a long appositive ``..., a region ...`` fact clause."""
    if len(text) < 180:
        return []
    match = re.search(r",\s+(a\s+region\s+[^.?!]+[.?!]?)$", text, re.I)
    if not match:
        return []
    prefix = text[: match.start() + 1].strip()
    clause = text[match.start() + 1 :].strip()
    body = re.sub(r"^a\s+region\s+with\s+", "", clause, flags=re.I).strip()
    if len(prefix.split()) < 10 or len(body.split()) < 8:
        return []
    return _split_rescue_at(
        text,
        match.start() + 1,
        prefix.rstrip(",") + ".",
        "This region has " + body,
    )


def rescue_units_for_translation(source: str) -> list[TranslationUnit]:
    """Return retry-only units for a source chunk that decoded poorly.

    The normal segmenter is precision-first.  This function is called only
    after the model produced a degenerate or implausibly short translation for
    an otherwise valid source unit.  It therefore uses slightly more aggressive
    but still syntactically motivated splits to recover translation instead of
    falling back to the entire paragraph.
    """
    compact = _compact(source)
    if not compact:
        return []
    for splitter in (
        _rescue_found_that_coordination,
        _rescue_if_so_semicolon,
        _rescue_nonrestrictive_where_clause,
        _rescue_appositive_region_clause,
    ):
        units = splitter(compact)
        if len(units) > 1 and validate_round_trip(compact, [unit.text for unit in units]):
            return units
    return []


def segment_for_translation(source: str) -> list[TranslationUnit]:
    """Protect first, split only at top-level sentence punctuation, then restore.

    Semicolon is intentionally never a normal boundary.  Long sentences remain
    intact rather than producing citation-only input for MADLAD.
    """
    compact = _compact(source)
    if not compact:
        return [TranslationUnit(source, protected_span_mask(source), _normalize_model_input(source))]
    # Protect before segmentation with an equal-length mask, so offsets still
    # slice the original text while citation/scientific punctuation cannot make
    # a boundary. Each resulting unit is then placeholder-protected immediately
    # before MADLAD generate and restored afterwards.
    parts: list[str] = []
    for list_part in _split_list_items(compact):
        for enumerated_part in _split_inline_enumeration(list_part):
            protected_part = protected_span_mask(enumerated_part)
            starts = [0, *_boundary_positions(protected_part)]
            sentence_parts = (
                enumerated_part[left:right].strip()
                for left, right in zip(starts, [*starts[1:], len(enumerated_part)])
            )
            for sentence_part in sentence_parts:
                parts.extend(_split_overlong_safe_clauses(sentence_part))
    parts = _merge_fragments(parts)
    units: list[TranslationUnit] = []
    for part in parts:
        for colon_source, colon_input in _complete_long_colon_predicate_list(part):
            for source_slice, model_input in _complete_long_relative_clause(colon_source):
                # A colon-list completion and relative-clause completion do
                # not both rewrite the same model input; the former is already
                # an independent predicate sentence.
                if colon_input != colon_source:
                    model_input = colon_input
                units.append(
                    TranslationUnit(
                        source_slice,
                        protected_span_mask(source_slice),
                        _normalize_model_input(model_input),
                    )
                )
    return units or [TranslationUnit(compact, protected_span_mask(compact), _normalize_model_input(compact))]


def split_for_translation(source: str) -> list[str]:
    return [unit.text for unit in segment_for_translation(source)]


def model_inputs_for_translation(source: str) -> list[str]:
    """Return model-facing inputs aligned one-to-one with source units."""
    return [unit.model_input for unit in segment_for_translation(source)]


def validate_round_trip(source: str, units: list[str]) -> bool:
    return _compact(source) == _compact(" ".join(units))
