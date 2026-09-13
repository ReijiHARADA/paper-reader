from __future__ import annotations

import unittest

from engines.madlad_mps import MADLADEngine


class MadladUnitQualityTests(unittest.TestCase):
    def test_rejects_long_natural_language_unit_reduced_to_its_conclusion(self) -> None:
        source = (
            "While the smaller sample has a larger variance, the correct answer "
            "is the smaller group because it is more likely to contain an extreme "
            "outcome than the larger comparison group in the same experiment."
        )
        output = "正解は小さい群である。"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_rejects_a_sentence_that_drops_its_material_qualification(self) -> None:
        source = (
            "Cathodal tDCS increased participants’ rule-following, even of rules "
            "that demanded to lose money or hurt another person financially."
        )
        output = "また、カソーダルtDCSは、参加者のルール遵守を増加させた。"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_rejects_a_borderline_compressed_result_sentence(self) -> None:
        source = (
            "Thus, the confrontation with a rather pro-social rule was able to "
            "attenuate the increased selfishness of participants under cathodal "
            "tDCS, while participants stayed more consistent with their free "
            "choices under anodal tDCS (Fig. 7b)."
        )
        output = "従って、対抗的なプロ社会的ルールは陰極tDCSの下で参加者の利己性を減弱させることができた。(Fig. 7b)。"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_allows_a_compact_but_substantive_sentence_translation(self) -> None:
        source = (
            "The experiment compares the two groups under the same condition and "
            "reports the observed response for every participant in the study."
        )
        output = "実験では同一条件下で二群を比較し、研究の全参加者について観測された反応を報告する。"
        self.assertFalse(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertFalse(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_allows_compact_translation_when_only_reporting_frame_is_omitted(self) -> None:
        source = (
            "Among other things they found that an emotional relation with an – at first nondescript – "
            "physical piece of jewellery could be established through interaction."
        )
        output = "また、宝石との感情的関係は、相互作用を通して確立されることが分かった。"
        self.assertFalse(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertFalse(MADLADEngine._is_degenerate(output, source, "ja"))

    def test_still_rejects_coordinated_claim_when_one_finding_is_omitted(self) -> None:
        source = (
            "Among other things they found that an emotional relation with an – at first nondescript – "
            "physical piece of jewellery could be established through interaction and that interactive "
            "jewellery holds the quality to make implicit emotions related to a piece of jewellery can "
            "be made explicit through interaction [29]."
        )
        output = "また、インタラクティブジュエリーは、ジュエリーに関連する内在的な感情をインタラクションを通して明示できる性質を持つことを示した。[29]"
        self.assertTrue(MADLADEngine._is_implausibly_short_unit(output, source))
        self.assertTrue(MADLADEngine._is_degenerate(output, source, "ja"))
