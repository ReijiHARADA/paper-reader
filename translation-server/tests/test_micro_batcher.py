from __future__ import annotations

import threading
import unittest
from concurrent.futures import Future
from unittest.mock import patch

from engines.micro_batcher import MicroBatchScheduler, _Pending


class FakeEngine:
    MODEL_ID = "fake-madlad"
    MODEL_VERSION = "test"
    _model_loaded = True
    _batch_size = 24

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.calls: list[tuple[str, list[str]]] = []
        self.fail_generate = False

    def load_model(self) -> None:
        return None

    @staticmethod
    def _is_degenerate(output: str, source: str, target_language: str) -> bool:
        return source.startswith("FAIL:")

    def _translate_chunks(
        self, chunks: list[str], target_language: str
    ) -> tuple[list[str], list[int], list[int]]:
        if self.fail_generate:
            raise RuntimeError("generate failed")
        self.calls.append((target_language, list(chunks)))
        pieces = [f"{target_language}:{chunk}" for chunk in chunks]
        in_toks = [max(1, len(chunk.split())) for chunk in chunks]
        out_toks = [max(1, len(piece.split())) for piece in pieces]
        return pieces, in_toks, out_toks


def _pending(text: str, src: str, tgt: str, index: int) -> _Pending:
    return _Pending(
        text=text,
        source_language=src,
        target_language=tgt,
        translate_body=text,
        heading_num=None,
        future=Future(),
        queued_at=0.0,
        request_index=index,
    )


def _identity_split(text: str) -> list[str]:
    return [text]


def _first_piece(chunks: list[str], pieces: list[str], lang: str) -> str:
    return pieces[0]


class MicroBatcherTests(unittest.TestCase):
    def test_same_language_pair_batches_together(self) -> None:
        engine = FakeEngine()
        sched = MicroBatchScheduler(engine)
        with (
            patch(
                "engines.micro_batcher.MADLADEngine._split_for_translation",
                _identity_split,
            ),
            patch(
                "engines.micro_batcher.MADLADEngine._join_translated_chunks",
                _first_piece,
            ),
        ):
            out = sched.translate_many(["Alpha sentence.", "Beta sentence."], "en", "ja")
        self.assertEqual(
            [r.text for r in out],
            ["ja:Alpha sentence.", "ja:Beta sentence."],
        )
        self.assertEqual(len(engine.calls), 1)
        self.assertEqual(engine.calls[0][0], "ja")
        self.assertEqual(engine.calls[0][1], ["Alpha sentence.", "Beta sentence."])

    def test_language_pairs_are_separated(self) -> None:
        engine = FakeEngine()
        sched = MicroBatchScheduler(engine)
        with (
            patch(
                "engines.micro_batcher.MADLADEngine._split_for_translation",
                _identity_split,
            ),
            patch(
                "engines.micro_batcher.MADLADEngine._join_translated_chunks",
                _first_piece,
            ),
        ):
            items = [
                _pending("Hello there.", "en", "ja", 0),
                _pending("Hello there.", "en", "ko", 1),
            ]
            results = sched._flush_items(items)
        self.assertEqual(results[0].target_language, "ja")
        self.assertEqual(results[1].target_language, "ko")
        self.assertEqual([lang for lang, _ in engine.calls], ["ja", "ko"])
        self.assertTrue(all(len(chunks) == 1 for _, chunks in engine.calls))

    def test_duplicate_text_keeps_request_order(self) -> None:
        engine = FakeEngine()
        sched = MicroBatchScheduler(engine)
        with (
            patch(
                "engines.micro_batcher.MADLADEngine._split_for_translation",
                _identity_split,
            ),
            patch(
                "engines.micro_batcher.MADLADEngine._join_translated_chunks",
                _first_piece,
            ),
        ):
            out = sched.translate_many(["same text", "same text"], "en", "ja")
        self.assertEqual([r.text for r in out], ["ja:same text", "ja:same text"])
        self.assertEqual(len(out), 2)

    def test_token_counts_are_per_request(self) -> None:
        engine = FakeEngine()
        sched = MicroBatchScheduler(engine)
        with (
            patch(
                "engines.micro_batcher.MADLADEngine._split_for_translation",
                staticmethod(lambda text: text.split("|")),
            ),
            patch(
                "engines.micro_batcher.MADLADEngine._join_translated_chunks",
                staticmethod(lambda chunks, pieces, lang: " ".join(pieces)),
            ),
        ):
            out = sched.translate_many(
                ["one two|three four", "a|b|c d e"],
                "en",
                "ja",
            )
        self.assertEqual(out[0].input_tokens, 4)
        self.assertEqual(out[1].input_tokens, 5)
        self.assertEqual(out[0].output_tokens, 4)
        self.assertEqual(out[1].output_tokens, 5)

    def test_returned_order_matches_input(self) -> None:
        engine = FakeEngine()
        sched = MicroBatchScheduler(engine)
        with (
            patch(
                "engines.micro_batcher.MADLADEngine._split_for_translation",
                _identity_split,
            ),
            patch(
                "engines.micro_batcher.MADLADEngine._join_translated_chunks",
                _first_piece,
            ),
        ):
            texts = ["first", "second", "third"]
            out = sched.translate_many(texts, "en", "ja")
        self.assertEqual([r.text for r in out], [f"ja:{t}" for t in texts])

    def test_failure_isolates_one_request(self) -> None:
        engine = FakeEngine()
        sched = MicroBatchScheduler(engine)
        with (
            patch(
                "engines.micro_batcher.MADLADEngine._split_for_translation",
                _identity_split,
            ),
            patch(
                "engines.micro_batcher.MADLADEngine._join_translated_chunks",
                _first_piece,
            ),
        ):
            items = [
                _pending("FAIL:bad", "en", "ja", 0),
                _pending("ok paragraph", "en", "ja", 1),
            ]
            results = sched._flush_items(items)
        self.assertIsNone(results[0])
        self.assertIsNotNone(items[0].future.exception())
        self.assertIsNotNone(results[1])
        self.assertEqual(results[1].text, "ja:ok paragraph")
        self.assertEqual(items[1].future.result().text, "ja:ok paragraph")


if __name__ == "__main__":
    unittest.main()
