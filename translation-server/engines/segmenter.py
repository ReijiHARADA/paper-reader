"""Semantic translation-unit segmentation shared by production and benchmarks.

This is deliberately a scanner, rather than a sentence-splitting regex: PDF
paragraphs contain decimals, abbreviations and author-year citations where a
period or semicolon is not a translation boundary.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .citation_protect import protected_span_mask

SEGMENTER_VERSION = "semantic-v3"
_ABBREVIATIONS = {"e.g.", "i.e.", "et al.", "fig.", "no.", "cf.", "dr.", "mr.", "ms.", "vs."}
_CONTINUATION_START = re.compile(r"^(?:and|or|but|to|of|for|in|on|where|which|that|one|exception)\b", re.I)


@dataclass(frozen=True)
class TranslationUnit:
    text: str
    protected: str


def _compact(text: str) -> str:
    return " ".join(text.split()).strip()


def _is_decimal(text: str, index: int) -> bool:
    return index > 0 and index + 1 < len(text) and text[index - 1].isdigit() and text[index + 1].isdigit()


def _is_abbreviation(text: str, index: int) -> bool:
    prefix = text[max(0, index - 12): index + 1].lower()
    return any(prefix.endswith(item) for item in _ABBREVIATIONS) or bool(re.search(r"\b[A-Z]\.$", text[: index + 1]))


def _boundary_positions(text: str) -> list[int]:
    positions: list[int] = []
    paren = square = brace = 0
    quote: str | None = None
    for i, char in enumerate(text):
        if char in "\"“”'":
            quote = None if quote == char else char
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
        fragment = len(words) < 4 or _CONTINUATION_START.match(part) or re.fullmatch(r"[^A-Za-z]*[A-Za-z]+(?:\s+et al\.)?,?\s*\d{4};?", part)
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


def segment_for_translation(source: str) -> list[TranslationUnit]:
    """Protect first, split only at top-level sentence punctuation, then restore.

    Semicolon is intentionally never a normal boundary.  Long sentences remain
    intact rather than producing citation-only input for MADLAD.
    """
    compact = _compact(source)
    if not compact:
        return [TranslationUnit(source, source)]
    # Protect before segmentation with an equal-length mask, so offsets still
    # slice the original text while citation/scientific punctuation cannot make
    # a boundary. Each resulting unit is then placeholder-protected immediately
    # before MADLAD generate and restored afterwards.
    parts: list[str] = []
    for list_part in _split_list_items(compact):
        protected_part = protected_span_mask(list_part)
        starts = [0, *_boundary_positions(protected_part)]
        parts.extend(
            list_part[left:right].strip()
            for left, right in zip(starts, [*starts[1:], len(list_part)])
        )
    parts = _merge_fragments(parts)
    return [TranslationUnit(part, protected_span_mask(part)) for part in parts] or [TranslationUnit(compact, protected_span_mask(compact))]


def split_for_translation(source: str) -> list[str]:
    return [unit.text for unit in segment_for_translation(source)]


def validate_round_trip(source: str, units: list[str]) -> bool:
    return _compact(source) == _compact(" ".join(units))
