"""Coalesce independent MADLAD chunks from concurrent /translate calls.

One worker thread runs model.generate(). Requests are never generate()-parallel.
"""

from __future__ import annotations

import os
import re
import threading
import time
from concurrent.futures import Future
from dataclasses import dataclass
from typing import Optional

from .base import TranslationResult
from .madlad_mps import MADLADEngine, get_engine


@dataclass
class _Pending:
    text: str
    source_language: str
    target_language: str
    translate_body: str
    heading_num: str | None
    future: Future
    queued_at: float


class MicroBatchScheduler:
    def __init__(self, engine: MADLADEngine):
        self._engine = engine
        self._window_ms = max(0, int(os.environ.get("MADLAD_MICROBATCH_MS", "25")))
        self._enabled = os.environ.get("MADLAD_MICROBATCH", "1") != "0"
        self._debug = os.environ.get("MADLAD_BATCH_DEBUG", "0") == "1"
        self._cond = threading.Condition()
        self._flush_lock = threading.Lock()
        self._queue: list[_Pending] = []
        self._thread: threading.Thread | None = None
        self._stop = False

    def start(self) -> None:
        if not self._enabled:
            return
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._loop, name="madlad-microbatch", daemon=True)
        self._thread.start()

    def translate(
        self,
        text: str,
        source_language: str,
        target_language: str,
    ) -> TranslationResult:
        if not self._enabled:
            return self._engine.translate(text, source_language, target_language)

        named = MADLADEngine._format_named_work_heading(text)
        if named and target_language == "ja":
            return self._named_result(named, text, source_language, target_language)

        translate_body, heading_num = self._strip_heading(text, target_language)

        future: Future = Future()
        pending = _Pending(
            text=text,
            source_language=source_language,
            target_language=target_language,
            translate_body=translate_body,
            heading_num=heading_num,
            future=future,
            queued_at=time.time(),
        )
        self.start()
        with self._cond:
            self._queue.append(pending)
            self._cond.notify()
        return future.result()

    def translate_many(
        self,
        texts: list[str],
        source_language: str,
        target_language: str,
    ) -> list[TranslationResult]:
        """Pack a known list of paragraphs in one flush (import / batch API)."""
        if not texts:
            return []
        if not self._enabled or len(texts) == 1:
            return [
                self.translate(text, source_language, target_language) for text in texts
            ]
        pending: list[_Pending] = []
        done: dict[int, TranslationResult] = {}
        for i, text in enumerate(texts):
            named = MADLADEngine._format_named_work_heading(text)
            if named and target_language == "ja":
                done[i] = self._named_result(
                    named, text, source_language, target_language
                )
                continue
            body, heading_num = self._strip_heading(text, target_language)
            pending.append(
                _Pending(
                    text=text,
                    source_language=source_language,
                    target_language=target_language,
                    translate_body=body,
                    heading_num=heading_num,
                    future=Future(),
                    queued_at=time.time(),
                )
            )
        flushed = self._flush_items(pending) if pending else []
        by_text: dict[str, TranslationResult] = {}
        for item, result in zip(pending, flushed):
            by_text[item.text] = result
        out: list[TranslationResult] = []
        for i, text in enumerate(texts):
            if i in done:
                out.append(done[i])
            else:
                out.append(by_text[text])
        return out

    @staticmethod
    def _named_result(
        named: str, text: str, source_language: str, target_language: str
    ) -> TranslationResult:
        return TranslationResult(
            text=named,
            source_language=source_language,
            target_language=target_language,
            model=MADLADEngine.MODEL_ID,
            model_version=MADLADEngine.MODEL_VERSION,
            input_chars=len(text),
            output_chars=len(named),
            input_tokens=0,
            output_tokens=0,
            translation_time_ms=0.0,
        )

    @staticmethod
    def _strip_heading(text: str, target_language: str) -> tuple[str, str | None]:
        heading = re.match(
            r"^(?P<num>\d+(?:\.\d+)*)[.)]\s+(?P<rest>.+)$",
            " ".join(text.split()).strip(),
        )
        if (
            target_language == "ja"
            and heading
            and len(heading.group("rest")) <= 80
            and heading.group("rest").count(".") == 0
        ):
            return heading.group("rest"), heading.group("num")
        return text, None

    def _loop(self) -> None:
        while not self._stop:
            with self._cond:
                while not self._queue and not self._stop:
                    self._cond.wait()
                if self._stop:
                    return
                if self._window_ms > 0:
                    deadline = time.monotonic() + self._window_ms / 1000.0
                    while time.monotonic() < deadline:
                        self._cond.wait(timeout=max(0.0, deadline - time.monotonic()))
                items = self._queue
                self._queue = []
            try:
                self._flush_items(items)
            except Exception as exc:
                for item in items:
                    if not item.future.done():
                        item.future.set_exception(exc)

    def _flush_items(self, items: list[_Pending]) -> list[TranslationResult]:
        if not items:
            return []
        with self._flush_lock:
            return self._flush_items_locked(items)

    def _flush_items_locked(self, items: list[_Pending]) -> list[TranslationResult]:
        if not items:
            return []
        t0 = time.time()
        engine = self._engine
        if not engine._model_loaded:
            engine.load_model()

        chunk_texts: list[str] = []
        spans: list[tuple[_Pending, list[str]]] = []
        for item in items:
            chunks = MADLADEngine._split_for_translation(item.translate_body)
            spans.append((item, chunks))
            chunk_texts.extend(chunks)

        with engine._lock:
            pieces, in_tok, out_tok = engine._translate_chunks(
                chunk_texts, items[0].target_language
            )

        results: list[TranslationResult] = []
        cursor = 0
        occupied = len(chunk_texts)
        if self._debug:
            print(
                f"[MICROBATCH] requests={len(items)} chunks={occupied} "
                f"batch_size={engine._batch_size} window_ms={self._window_ms} "
                f"generate_groups={(occupied + engine._batch_size - 1) // max(engine._batch_size, 1)}",
                flush=True,
            )

        for item, chunks in spans:
            n = len(chunks)
            part = pieces[cursor : cursor + n]
            cursor += n
            try:
                translated = MADLADEngine._join_translated_chunks(
                    chunks, part, item.target_language
                )
                if item.heading_num:
                    translated = f"{item.heading_num}. {translated.lstrip()}"
                if engine._is_degenerate(translated, item.text, item.target_language):
                    raise ValueError("degenerate translation output")
                elapsed_ms = (time.time() - t0) * 1000
                result = TranslationResult(
                    text=translated,
                    source_language=item.source_language,
                    target_language=item.target_language,
                    model=engine.MODEL_ID,
                    model_version=engine.MODEL_VERSION,
                    input_chars=len(item.text),
                    output_chars=len(translated),
                    input_tokens=in_tok,
                    output_tokens=out_tok,
                    translation_time_ms=elapsed_ms,
                )
                results.append(result)
                if not item.future.done():
                    item.future.set_result(result)
            except Exception as exc:
                if not item.future.done():
                    item.future.set_exception(exc)
                raise
        return results


_scheduler: Optional[MicroBatchScheduler] = None


def get_scheduler() -> MicroBatchScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = MicroBatchScheduler(get_engine())
        _scheduler.start()
    return _scheduler
