"""Protect numeric citation brackets around MADLAD generate / restore after.

Placeholders are ASCII tokens chosen so greedy MADLAD decoding tends to copy
them rather than translate or drop them. Measured against the fixed
benchmarks/corpus.json citation case (see tests/test_citation_protect.py and
scripts/bench_citation_protect.py).
"""

from __future__ import annotations

import re

# Numeric citations only: [8], [12], [1, 3], [12,13], [1-4], [1–4], [1, 3–5, 8]
CITATION_RE = re.compile(
    r"\["
    r"\d+(?:\s*[-–—]\s*\d+)?"
    r"(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*"
    r"\]"
)

# Empirically, MADLAD-400 3B greedy decode often copies ZZCIT1ZZ / ZZCIT2ZZ
# in academic sentences (measured on the citation corpus). ZZCIT0ZZ was dropped
# in the same van Dijk sentence, so indices are 1-based.
_PLACEHOLDER_PREFIX = "ZZCIT"
_PLACEHOLDER_SUFFIX = "ZZ"


def placeholder_for(index: int, nonce: int = 0) -> str:
    n = index + 1
    if nonce:
        return f"{_PLACEHOLDER_PREFIX}{nonce}X{n}{_PLACEHOLDER_SUFFIX}"
    return f"{_PLACEHOLDER_PREFIX}{n}{_PLACEHOLDER_SUFFIX}"


def _placeholder_pattern(index: int, nonce: int) -> re.Pattern[str]:
    token = placeholder_for(index, nonce)
    return re.compile(re.escape(token), re.IGNORECASE)


def protect_citations(text: str) -> tuple[str, list[str], int]:
    """Replace citation brackets with placeholders. Returns text, originals, nonce."""
    matches = list(CITATION_RE.finditer(text))
    if not matches:
        return text, [], 0

    citations = [m.group(0) for m in matches]
    nonce = 0
    while True:
        tokens = [placeholder_for(i, nonce) for i in range(len(citations))]
        if all(token not in text for token in tokens):
            break
        nonce += 1
        if nonce > 50:
            return text, [], 0

    out = text
    for i, match in enumerate(reversed(matches)):
        idx = len(matches) - 1 - i
        out = out[: match.start()] + placeholder_for(idx, nonce) + out[match.end() :]
    return out, citations, nonce


def _to_halfwidth(text: str) -> str:
    """MADLAD often emits fullwidth Latin (ＺＺＣＩＴ１ＺＺ). Restore ASCII first."""
    out: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0xFF01 <= code <= 0xFF5E:
            out.append(chr(code - 0xFEE0))
        elif code == 0x3000:
            out.append(" ")
        else:
            out.append(ch)
    return "".join(out)


def restore_citations(text: str, citations: list[str], nonce: int = 0) -> str:
    """Put original citation strings back, preserving content and order."""
    if not citations:
        return _to_halfwidth(text)
    out = _to_halfwidth(text)
    missing: list[str] = []
    for i, citation in enumerate(citations):
        pattern = _placeholder_pattern(i, nonce)
        if pattern.search(out):
            out = pattern.sub(citation, out, count=1)
        elif citation not in out:
            missing.append(citation)
    leftover = (
        re.compile(rf"{re.escape(_PLACEHOLDER_PREFIX)}\d+X\d+{re.escape(_PLACEHOLDER_SUFFIX)}", re.I)
        if nonce
        else re.compile(rf"{re.escape(_PLACEHOLDER_PREFIX)}\d+{re.escape(_PLACEHOLDER_SUFFIX)}", re.I)
    )
    out = leftover.sub("", out)
    if missing:
        out = out.rstrip() + "".join(missing)
    return out
