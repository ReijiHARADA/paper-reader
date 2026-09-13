from __future__ import annotations

import unittest

from engines.madlad_mps import MADLADEngine
from engines.segmenter import (
    model_inputs_for_translation,
    rescue_units_for_translation,
    segment_for_translation,
    split_for_translation,
    validate_round_trip,
)


class SegmenterTests(unittest.TestCase):
    def assert_round_trip(self, source: str) -> None:
        units = split_for_translation(source)
        self.assertTrue(validate_round_trip(source, units))
        self.assertTrue(all(len(unit.split()) >= 4 for unit in units), units)

    def test_word_ending_in_ms_is_a_sentence_boundary(self) -> None:
        source = "The mechanisms are described. We then compare the results."
        self.assertEqual(split_for_translation(source), ["The mechanisms are described.", "We then compare the results."])

    def test_author_year_semicolons_stay_together(self) -> None:
        source = "The closest related work on finger specific interaction has been presented by (Sigure & Koseki, 1998; Marquardt et al., 2011; Benko et al, 2009), however none are in the mobile domain."
        units = split_for_translation(source)
        self.assertEqual(units, [source])
        self.assert_round_trip(source)

    def test_model_input_repairs_lost_apostrophe_without_changing_source(self) -> None:
        source = "“Its not scary like blood pressure, it feels like a costume or sports gear, activity oriented”"
        units = split_for_translation(source)
        inputs = model_inputs_for_translation(source)
        self.assertEqual(units, [source])
        self.assertEqual(inputs, ["“It's not scary like blood pressure, it feels like a costume or sports gear, activity oriented”"])
        self.assert_round_trip(source)

    def test_model_input_repairs_neither_nor_comma_without_changing_source(self) -> None:
        source = "Neither cathodal, nor anodal tDCS altered the fairness perception of participants (Fig. 8 and Table S3)."
        units = split_for_translation(source)
        inputs = model_inputs_for_translation(source)
        self.assertEqual(units, [source])
        self.assertEqual(inputs, ["Neither cathodal nor anodal tDCS altered the fairness perception of participants (Fig. 8 and Table S3)."])
        self.assert_round_trip(source)

    def test_empty_source_can_still_be_segmented(self) -> None:
        units = segment_for_translation("   ")
        self.assertEqual(len(units), 1)
        self.assertEqual(units[0].text, "   ")

    def test_year_is_a_sentence_boundary_but_decimal_is_not(self) -> None:
        source = "Nearly one billion devices were sold in 2013. Thus, the value was 2.913 and p < 0.001."
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertIn("2.913", units[1])
        self.assert_round_trip(source)

    def test_experimental_single_letter_label_can_end_a_sentence(self) -> None:
        source = "Participants judged allocations between a person A and a person B. Neither cathodal, nor anodal tDCS altered the fairness perception of participants (Fig. 8 and Table S3)."
        units = split_for_translation(source)
        inputs = model_inputs_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertEqual(units[1], "Neither cathodal, nor anodal tDCS altered the fairness perception of participants (Fig. 8 and Table S3).")
        self.assertEqual(inputs[1], "Neither cathodal nor anodal tDCS altered the fairness perception of participants (Fig. 8 and Table S3).")
        self.assert_round_trip(source)

    def test_author_initial_still_stays_with_name(self) -> None:
        source = "J. Smith reported the result. We then replicated it."
        units = split_for_translation(source)
        self.assertEqual(units, ["J. Smith reported the result.", "We then replicated it."])
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

    def test_complete_purpose_sentence_is_not_merged_as_a_continuation(self) -> None:
        source = "Power sources constrain wearable devices. To decrease form factors further, researchers investigated alternative power schemes that capture power rather than carrying it."
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertEqual(units[1], "To decrease form factors further, researchers investigated alternative power schemes that capture power rather than carrying it.")
        self.assert_round_trip(source)

    def test_short_complete_questions_keep_their_sentence_boundaries(self) -> None:
        source = "An experiment is central. But what constitutes an experiment? And how does one write a paper?"
        units = split_for_translation(source)
        self.assertEqual(units, [
            "An experiment is central.",
            "But what constitutes an experiment?",
            "And how does one write a paper?",
        ])
        self.assert_round_trip(source)

    def test_typographic_quotes_do_not_hide_later_sentence_boundaries(self) -> None:
        source = "The canonical “Linda problem” is widely used. It tests a conjunction fallacy. Participants then compare two options."
        units = split_for_translation(source)
        self.assertEqual(units, [
            "The canonical “Linda problem” is widely used.",
            "It tests a conjunction fallacy.",
            "Participants then compare two options.",
        ])
        self.assert_round_trip(source)

    def test_apostrophes_inside_words_do_not_open_a_quote(self) -> None:
        source = "The model's output does not match the source. It should be reviewed separately."
        self.assertEqual(split_for_translation(source), [
            "The model's output does not match the source.",
            "It should be reviewed separately.",
        ])

    def test_long_participant_relative_clause_has_an_independent_model_input(self) -> None:
        source = (
            "Finally, we asked GPT-3 to provide an answer to the hospital problem "
            "(see SI Appendix), in which participants are asked which of two hospitals, "
            "a smaller or a larger one, is more likely to report more days on which more "
            "than 60% of all born children were boys."
        )
        units = segment_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertEqual(" ".join(unit.text for unit in units), source)
        self.assertTrue(units[0].text.endswith(","))
        self.assertTrue(units[0].model_input.endswith("."))
        self.assertTrue(units[1].text.startswith("in which participants"))
        self.assertTrue(units[1].model_input.startswith("In this context, participants"))

    def test_long_model_predicate_list_gets_independent_model_inputs(self) -> None:
        source = (
            "We find that much of GPT-3’s behavior is impressive: it solves vignette-based tasks similarly or better than human subjects, "
            "is able to make decent decisions from descriptions, outperforms humans in a multi-armed bandit task, "
            "and shows signatures of model-based reinforcement learning."
        )
        units = segment_for_translation(source)
        self.assertEqual(" ".join(unit.text for unit in units), source)
        self.assertEqual(len(units), 5)
        self.assertEqual(units[0].model_input, "We find that much of GPT-3’s behavior is impressive.")
        self.assertEqual(units[1].model_input, "GPT-3 solves vignette-based tasks similarly or better than human subjects.")
        self.assertEqual(units[-1].model_input, "GPT-3 shows signatures of model-based reinforcement learning.")

    def test_flattened_bullet_list_keeps_lead_in_and_each_item_as_a_unit(self) -> None:
        source = "The course covers: • Formulating testable research questions • How to design an experiment to answer research questions • Parts of an experiment and ethics approval"
        units = split_for_translation(source)
        self.assertEqual(len(units), 4)
        self.assertEqual(units[0], "The course covers:")
        self.assertTrue(all(unit.startswith("•") for unit in units[1:]))
        self.assertTrue(validate_round_trip(source, units))

    def test_inline_numbered_list_keeps_every_condition_as_a_unit(self) -> None:
        source = "The method has limitations: (1) it needs unique solutions; (2) it needs an unstable oracle; (3) it has no model selection. We address all three."
        units = split_for_translation(source)
        self.assertEqual(len(units), 5)
        self.assertEqual(units[0], "The method has limitations:")
        self.assertTrue(all(f"({number})" in units[number] for number in range(1, 4)))
        self.assert_round_trip(source)

    def test_overlong_top_level_semicolon_splits_into_safe_clauses(self) -> None:
        source = "The first clause explains the experimental context and includes enough ordinary prose to establish a meaningful translation unit for the model without relying on a shorthand notation or a citation, while also explaining the participant procedure and why the first condition matters; " + "the second clause explains the evaluation outcome and includes enough independent ordinary prose to remain meaningful after the safe boundary while preserving the original punctuation and ordering."
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(units[0].endswith(";"))
        self.assert_round_trip(source)

    def test_medium_top_level_semicolon_keeps_independent_claims_separate(self) -> None:
        source = (
            "Encoder-only models struggle with deep structural reasoning compared to "
            "autoregressive models in the same grammar setting; and adding structured "
            "noise to pretraining data improves robustness to corrupted language prompts."
        )
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(units[0].endswith(";"))
        self.assertTrue(units[1].startswith("and adding"))
        self.assert_round_trip(source)

    def test_author_year_semicolon_never_becomes_a_clause_boundary(self) -> None:
        source = "The first clause explains the experimental context with enough ordinary prose to make a long translation unit for the model, citing (Sigure & Koseki, 1998; Marquardt et al., 2011; Benko et al., 2009) as prior work before continuing through a detailed explanation of why the setup matters for later analysis and interpretation in the study."
        self.assertEqual(split_for_translation(source), [source])

    def test_quoted_figure_caption_lead_can_split_from_long_description(self) -> None:
        source = "“Traces” (Fig.7), made for one participant; a jeweller who does not wear jewellery discusses strong attachments that can pass from generation to generation, and the piece uses a porcelain pearl, clasps, and velvet to show contours, folds, and hinges as etched lines across the surface of the fabric, while the arrangement preserves the material history and intimate significance described by the participant."
        units = split_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertEqual(units[0], "“Traces” (Fig.7), made for one participant;")
        self.assert_round_trip(source)

    def test_list_join_restores_markers(self) -> None:
        chunks = ["The course covers:", "• First item", "• Second item"]
        pieces = ["コースでは以下を扱う", "第一項目", "第二項目"]
        self.assertEqual(
            MADLADEngine._join_translated_chunks(chunks, pieces, "ja"),
            "コースでは以下を扱う\n• 第一項目\n• 第二項目",
        )

    def test_list_join_deduplicates_model_markers(self) -> None:
        chunks = ["• First item", "• Second item"]
        pieces = ["- 第一項目", "• 第二項目"]
        self.assertEqual(
            MADLADEngine._join_translated_chunks(chunks, pieces, "ja"),
            "• 第一項目\n• 第二項目",
        )

    def test_inline_list_ordinal_is_detached_and_restored_deterministically(self) -> None:
        self.assertEqual(
            MADLADEngine._detach_enumeration_prefix("(2) requiring an unstable oracle;"),
            ("(2)", "requiring an unstable oracle;"),
        )
        self.assertEqual(MADLADEngine._detach_enumeration_prefix("Equation (2) is stable."), ("", "Equation (2) is stable."))

    def test_model_completed_boundary_closes_japanese_piece_after_inline_citation(self) -> None:
        self.assertEqual(
            MADLADEngine._join_translated_chunks(
                ["We posed a problem17,", "in which participants choose an option."],
                ["問題を提示した17", "参加者は選択肢を選ぶ"],
                "ja",
                ["We posed a problem17.", "In this context, participants choose an option."],
            ),
            "問題を提示した17。参加者は選択肢を選ぶ。",
        )

    def test_rescue_found_that_coordination_keeps_source_round_trip(self) -> None:
        source = (
            "Among other things they found that an emotional relation with an – at first nondescript – "
            "physical piece of jewellery could be established through interaction and that interactive "
            "jewellery holds the quality to make implicit emotions related to a piece of jewellery can "
            "be made explicit through interaction [29]."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertTrue(units[1].model_input.startswith("They found that interactive jewellery"))

    def test_rescue_if_so_semicolon_keeps_source_round_trip(self) -> None:
        source = (
            "As viewers we must consider whether we believe there is a gold ball within the piece; "
            "if so, do we perceive the piece to be of greater value even though the gold is hidden?"
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertTrue(units[0].model_input.endswith("."))
        self.assertTrue(units[1].model_input.startswith("If so"))

    def test_rescue_where_property_clause_keeps_source_round_trip(self) -> None:
        source = "We invested most of our efforts in optimizing our worn receivers, where size, weight, form factor and power efficiency are paramount."
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertEqual(
            units[1].model_input,
            "In this context, size, weight, form factor and power efficiency are paramount.",
        )

    def test_rescue_appositive_region_keeps_source_round_trip(self) -> None:
        source = (
            "The Thermal Earring takes advantage of the unique position of earrings in proximity to the head, "
            "a region with tight coupling to the body unlike watches and other wearables which are more loosely worn on extremities."
        )
        units = rescue_units_for_translation(source)
        self.assertEqual(len(units), 2)
        self.assertTrue(validate_round_trip(source, [unit.text for unit in units]))
        self.assertEqual(
            units[1].model_input,
            "This region has tight coupling to the body unlike watches and other wearables which are more loosely worn on extremities.",
        )


if __name__ == "__main__":
    unittest.main()
