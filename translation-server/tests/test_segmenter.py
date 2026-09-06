from __future__ import annotations

import unittest

from engines.madlad_mps import MADLADEngine
from engines.segmenter import split_for_translation, validate_round_trip


class SegmenterTests(unittest.TestCase):
    def assert_round_trip(self, source: str) -> None:
        units = split_for_translation(source)
        self.assertTrue(validate_round_trip(source, units))
        self.assertTrue(all(len(unit.split()) >= 4 for unit in units), units)

    def test_author_year_semicolons_stay_together(self) -> None:
        source = "The closest related work on finger specific interaction has been presented by (Sigure & Koseki, 1998; Marquardt et al., 2011; Benko et al, 2009), however none are in the mobile domain."
        units = split_for_translation(source)
        self.assertEqual(units, [source])
        self.assert_round_trip(source)

    def test_year_is_a_sentence_boundary_but_decimal_is_not(self) -> None:
        source = "Nearly one billion devices were sold in 2013. Thus, the value was 2.913 and p < 0.001."
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertIn("2.913", units[1])
        self.assert_round_trip(source)


    def test_second_author_year_citation_stays_with_its_sentence(self) -> None:
        source = "Unlike most touch screen research seeking to extend the input vocabulary, which does not distinguish between different fingers (e.g. Baudisch & Chu, 2009; Boring et al., 2012; Holleis et al., 2008), we focus on identifying the fingers and assigning different functions to them."
        units = split_for_translation(source)
        self.assertEqual(units, [source])
        self.assert_round_trip(source)

    def test_scientific_tokens_cannot_create_boundaries(self) -> None:
        source = "The result was F(4,33) = 2.913, p < 0.001. Thus, the hypothesis was supported."
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertIn("F(4,33) = 2.913, p < 0.001.", units[0])
        self.assert_round_trip(source)

    def test_continuations_merge_before_send(self) -> None:
        source = "Examination of targets indicated errors. One exception to this is the low miss rate."
        self.assert_round_trip(source)

    def test_flattened_bullet_list_keeps_lead_in_and_each_item_as_a_unit(self) -> None:
        source = "The course covers: • Formulating testable research questions • How to design an experiment to answer research questions • Parts of an experiment and ethics approval"
        units = split_for_translation(source)
        self.assertEqual(len(units), 4)
        self.assertEqual(units[0], "The course covers:")
        self.assertTrue(all(unit.startswith("•") for unit in units[1:]))
        self.assertTrue(validate_round_trip(source, units))

    def test_list_join_restores_markers(self) -> None:
        chunks = ["The course covers:", "• First item", "• Second item"]
        pieces = ["コースでは以下を扱う", "第一項目", "第二項目"]
        self.assertEqual(
            MADLADEngine._join_translated_chunks(chunks, pieces, "ja"),
            "コースでは以下を扱う\n• 第一項目\n• 第二項目",
        )


if __name__ == "__main__":
    unittest.main()
