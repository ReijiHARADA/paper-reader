from __future__ import annotations

import json
import unittest
from pathlib import Path

from engines.citation_protect import (
    CITATION_RE,
    protect_citations,
    restore_citations,
)


class CitationProtectTests(unittest.TestCase):
    def test_single_citation(self) -> None:
        src = "Smith et al. [8] proposed a method."
        protected, cites, nonce = protect_citations(src)
        self.assertEqual(cites, ["[8]"])
        self.assertNotIn("[8]", protected)
        self.assertEqual(restore_citations(protected, cites, nonce), src)

    def test_multiple_citations(self) -> None:
        src = "See [8] then [12] and [3]."
        protected, cites, nonce = protect_citations(src)
        self.assertEqual(cites, ["[8]", "[12]", "[3]"])
        self.assertEqual(restore_citations(protected, cites, nonce), src)

    def test_comma_list(self) -> None:
        src = "Prior work [1, 3] agrees."
        _, cites, _ = protect_citations(src)
        self.assertEqual(cites, ["[1, 3]"])

    def test_range_hyphen_and_en_dash(self) -> None:
        src = "See [1-4] and [1–4]."
        _, cites, _ = protect_citations(src)
        self.assertEqual(cites, ["[1-4]", "[1–4]"])

    def test_mixed_list_and_range(self) -> None:
        src = "Compare [1, 3–5, 8] with [12,13]."
        protected, cites, nonce = protect_citations(src)
        self.assertEqual(cites, ["[1, 3–5, 8]", "[12,13]"])
        self.assertEqual(restore_citations(protected, cites, nonce), src)

    def test_same_citation_repeated(self) -> None:
        src = "First [8] and again [8]."
        protected, cites, nonce = protect_citations(src)
        self.assertEqual(cites, ["[8]", "[8]"])
        self.assertEqual(restore_citations(protected, cites, nonce), src)

    def test_no_citation(self) -> None:
        src = "No brackets here."
        protected, cites, nonce = protect_citations(src)
        self.assertEqual(cites, [])
        self.assertEqual(protected, src)
        self.assertEqual(restore_citations(protected, cites, nonce), src)

    def test_non_citation_brackets_ignored(self) -> None:
        src = "See [Figure] and [Appendix] and [ABC] but keep [8]."
        protected, cites, nonce = protect_citations(src)
        self.assertEqual(cites, ["[8]"])
        self.assertIn("[Figure]", protected)
        self.assertIn("[Appendix]", protected)
        self.assertIn("[ABC]", protected)
        self.assertEqual(restore_citations(protected, cites, nonce), src)

    def test_citation_regex_rejects_letters(self) -> None:
        self.assertIsNotNone(CITATION_RE.search("[12]"))
        self.assertIsNone(CITATION_RE.search("[Figure]"))
        self.assertIsNone(CITATION_RE.search("[8a]"))
        self.assertIsNone(CITATION_RE.search("[ABC]"))

    def test_restores_fullwidth_placeholders(self) -> None:
        src = "See [12] and [3]."
        _, cites, nonce = protect_citations(src)
        fullwidth = "後の研究（ＺＺＣＩＴ１ＺＺ）と（ＺＺＣＩＴ２ＺＺ）。"
        restored = restore_citations(fullwidth, cites, nonce)
        self.assertEqual(cites, ["[12]", "[3]"])
        self.assertIn("[12]", restored)
        self.assertIn("[3]", restored)
        self.assertNotIn("ZZCIT", restored)
        self.assertNotIn("ＺＺＣＩＴ", restored)

    def test_fixed_corpus_citation_case(self) -> None:
        corpus = json.loads(
            (Path(__file__).resolve().parents[1] / "benchmarks" / "corpus.json").read_text(
                encoding="utf-8"
            )
        )
        case = next(c for c in corpus["cases"] if c["id"] == "citations")
        protected, cites, nonce = protect_citations(case["text"])
        self.assertEqual(cites, ["[8]", "[12]", "[3]"])
        self.assertEqual(restore_citations(protected, cites, nonce), case["text"])
        self.assertIn("ZZCIT1ZZ", protected)
        self.assertNotIn("[8]", protected)


if __name__ == "__main__":
    unittest.main()
