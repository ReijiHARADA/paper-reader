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
    request_index: int = -1


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
                    request_index=i,
                )
            )
        flushed = self._flush_items(pending) if pending else []
        by_index: dict[int, TranslationResult] = dict(done)
        for item, result in zip(pending, flushed):
            if result is None:
                item.future.result()
            by_index[item.request_index] = result
        return [by_index[i] for i in range(len(texts))]

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

    def _flush_items(self, items: list[_Pending]) -> list[TranslationResult | None]:
        if not items:
            return []
        with self._flush_lock:
            return self._flush_items_locked(items)

    @staticmethod
    def _language_groups(items: list[_Pending]) -> list[list[_Pending]]:
        groups: dict[tuple[str, str], list[_Pending]] = {}
        order: list[tuple[str, str]] = []
        for item in items:
            key = (item.source_language, item.target_language)
            if key not in groups:
                order.append(key)
                groups[key] = []
            groups[key].append(item)
        return [groups[key] for key in order]

    def _flush_items_locked(self, items: list[_Pending]) -> list[TranslationResult | None]:
        if not items:
            return []
        engine = self._engine
        if not engine._model_loaded:
            engine.load_model()

        by_id: dict[int, TranslationResult | None] = {}
        for group in self._language_groups(items):
            group_results = self._translate_language_group(group)
            for item, result in zip(group, group_results):
                by_id[id(item)] = result
        return [by_id[id(item)] for item in items]

    def _translate_language_group(
        self, items: list[_Pending]
    ) -> list[TranslationResult | None]:
        if not items:
            return []
        t0 = time.time()
        engine = self._engine
        target_language = items[0].target_language

        chunk_texts: list[str] = []
        spans: list[tuple[_Pending, list[str]]] = []
        for item in items:
            chunks = MADLADEngine._split_for_translation(item.translate_body)
            spans.append((item, chunks))
            chunk_texts.extend(chunks)

        with engine._lock:
            pieces, in_toks, out_toks = engine._translate_chunks(
                chunk_texts, target_language
            )

        occupied = len(chunk_texts)
        if self._debug:
            print(
                f"[MICROBATCH] pair={items[0].source_language}->{target_language} "
                f"requests={len(items)} chunks={occupied} "
                f"batch_size={engine._batch_size} window_ms={self._window_ms} "
                f"generate_groups={(occupied + engine._batch_size - 1) // max(engine._batch_size, 1)}",
                flush=True,
            )

        results: list[TranslationResult | None] = []
        cursor = 0
        for item, chunks in spans:
            n = len(chunks)
            part = pieces[cursor : cursor + n]
            item_in = sum(in_toks[cursor : cursor + n])
            item_out = sum(out_toks[cursor : cursor + n])
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
                    input_tokens=item_in,
                    output_tokens=item_out,
                    translation_time_ms=elapsed_ms,
                )
                results.append(result)
                if not item.future.done():
                    item.future.set_result(result)
            except Exception as exc:
                results.append(None)
                if not item.future.done():
                    item.future.set_exception(exc)
        return results


_scheduler: Optional[MicroBatchScheduler] = None


def get_scheduler() -> MicroBatchScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = MicroBatchScheduler(get_engine())
        _scheduler.start()
    return _scheduler
