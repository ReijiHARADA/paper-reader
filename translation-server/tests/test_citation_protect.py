from __future__ import annotations

import json
import unittest
from pathlib import Path

from engines.citation_protect import (
    AUTHOR_YEAR_CITATION_RE,
    CITATION_RE,
    INLINE_FOOTNOTE_CITATION_RE,
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

    def test_protects_ascii_chi_square_statistic(self) -> None:
        source = "There was no difference (chi square test, χ2(3)=0.37, p=0.83)."
        protected, citations, nonce = protect_citations(source)
        self.assertIn("χ2(3)=0.37", citations)
        self.assertIn("p=0.83", citations)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_bare_rank_statistic_and_figure_panel_reference(self) -> None:
        source = "Selfishness changed (Fig. 7b, Mann–Whitney U test, U=307, p=0.03)."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["(Fig. 7b, Mann–Whitney U test, U=307, p=0.03)"])
        self.assertNotIn("Mann–Whitney", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_plural_figure_references(self) -> None:
        source = "Figures 3, 4, and 5 show the response curves."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["Figures 3"])
        self.assertNotIn("Figures 3", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_terminal_caps_technical_identifiers(self) -> None:
        source = "We compare DeepIV with a wearable product."
        protected, citations, nonce = protect_citations(source)
        self.assertNotIn("DeepIV", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_hyphenated_title_case_system_identifiers(self) -> None:
        source = "We developed Power-over-Skin for distributed wearable devices."
        protected, citations, nonce = protect_citations(source)
        self.assertNotIn("Power-over-Skin", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_protects_author_year_group_as_one_atomic_span(self) -> None:
        source = "Prior work (Sigure & Koseki, 1998; Marquardt et al., 2011) motivates Deep IV."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["(Sigure & Koseki, 1998; Marquardt et al., 2011)"])
        self.assertNotIn("2011", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_author_year_pattern_does_not_capture_non_citation_parentheses(self) -> None:
        self.assertIsNone(AUTHOR_YEAR_CITATION_RE.search("The value (2017 measurements) was stable."))

    def test_protects_inline_footnote_after_quoted_term(self) -> None:
        source = "We introduced the “cab problem”16 (Cab, see SI Appendix)."
        protected, citations, nonce = protect_citations(source)
        self.assertEqual(citations, ["16"])
        self.assertIsNotNone(INLINE_FOOTNOTE_CITATION_RE.search(source))
        self.assertNotIn("16", protected)
        self.assertEqual(restore_citations(protected, citations, nonce), source)

    def test_restores_inline_footnote_before_japanese_sentence_end(self) -> None:
        source = "We introduced the “cab problem”16 (Cab, see SI Appendix)."
        protected, citations, nonce = protect_citations(source)
        placeholder = protected.split("problem”", 1)[1].split(" ", 1)[0]
        restored = restore_citations(f"問題を提示した。{placeholder}。", citations, nonce)
        self.assertEqual(restored, "問題を提示した16。")

    def test_restores_dropped_inline_footnote_before_japanese_sentence_end(self) -> None:
        source = "We introduced the “cab problem”16 (Cab, see SI Appendix)."
        _, citations, nonce = protect_citations(source)
        restored = restore_citations("問題を提示した。", citations, nonce)
        self.assertEqual(restored, "問題を提示した16。")


if __name__ == "__main__":
    unittest.main()
