"""Experimental MPS batching. Isolated from production MADLADEngine.translate()."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import torch

from bench_common import join_translated_chunks, max_new_tokens_for, split_for_translation
from engines.madlad_mps import MADLADEngine

BUCKETS = (
    (32, "short"),
    (64, "medium"),
    (128, "long"),
    (512, "very_long"),
)


@dataclass
class ChunkJob:
    request_id: int
    chunk_index: int
    original_order: int
    text: str
    input_token_count: int = 0


@dataclass
class BatchStats:
    size: int
    actual_tokens: int
    padded_tokens: int
    padding_ratio: float
    per_chunk_max_new: list[int]
    batch_max_new: int
    generate_s: float = 0.0


@dataclass
class TranslateStats:
    generate_calls: int = 0
    batches: list[BatchStats] = field(default_factory=list)
    occupancy_sum: float = 0.0
    occupancy_n: int = 0
    error: str | None = None

    @property
    def average_occupancy(self) -> float:
        if self.occupancy_n == 0:
            return 0.0
        return self.occupancy_sum / self.occupancy_n

    @property
    def average_padding_ratio(self) -> float:
        if not self.batches:
            return 0.0
        return sum(b.padding_ratio for b in self.batches) / len(self.batches)

    def as_dict(self) -> dict[str, Any]:
        return {
            "generate_calls": self.generate_calls,
            "average_occupancy": round(self.average_occupancy, 3),
            "average_padding_ratio": round(self.average_padding_ratio, 3),
            "error": self.error,
            "batches": [
                {
                    "size": b.size,
                    "actual_tokens": b.actual_tokens,
                    "padded_tokens": b.padded_tokens,
                    "padding_ratio": round(b.padding_ratio, 4),
                    "per_chunk_max_new": b.per_chunk_max_new,
                    "batch_max_new": b.batch_max_new,
                    "generate_s": round(b.generate_s, 4),
                }
                for b in self.batches
            ],
        }


def bucket_name(token_count: int) -> str:
    for limit, name in BUCKETS:
        if token_count <= limit:
            return name
    return "very_long"


def _sync() -> None:
    if torch.backends.mps.is_available():
        torch.mps.synchronize()


class ExperimentalTranslator:
    """Single-threaded MPS generate() with optional bucketing and token budget."""

    def __init__(self, engine: MADLADEngine):
        self.engine = engine
        self.target_language = "ja"
        self.max_batch_size = 8
        self.use_buckets = False
        self.token_budget: int | None = None
        self.verbose = False

    def count_tokens(self, text: str) -> int:
        lang = f"<2{self.target_language}>"
        encoded = self.engine._tokenizer(
            f"{lang} {text}",
            truncation=True,
            max_length=512,
            add_special_tokens=True,
            padding=False,
        )
        return int(len(encoded["input_ids"]))

    def translate_paragraph(self, text: str) -> tuple[str, int, int, TranslateStats]:
        chunks = split_for_translation(text)
        jobs = [
            ChunkJob(0, i, i, chunk, self.count_tokens(chunk))
            for i, chunk in enumerate(chunks)
        ]
        pieces, in_tok, out_tok, stats = self._run_jobs(jobs, n_requests=1)
        joined = join_translated_chunks(chunks, pieces[0], self.target_language)
        return joined, in_tok, out_tok, stats

    def translate_paragraphs(self, paragraphs: list[str]) -> tuple[list[str], int, int, TranslateStats]:
        jobs: list[ChunkJob] = []
        chunk_lists: list[list[str]] = []
        order = 0
        for req_id, paragraph in enumerate(paragraphs):
            chunks = split_for_translation(paragraph)
            chunk_lists.append(chunks)
            for idx, chunk in enumerate(chunks):
                jobs.append(
                    ChunkJob(req_id, idx, order, chunk, self.count_tokens(chunk))
                )
                order += 1
        pieces_by_req, in_tok, out_tok, stats = self._run_jobs(jobs, n_requests=len(paragraphs))
        texts = [
            join_translated_chunks(chunks, pieces_by_req[i], self.target_language)
            for i, chunks in enumerate(chunk_lists)
        ]
        return texts, in_tok, out_tok, stats

    def _run_jobs(
        self, jobs: list[ChunkJob], n_requests: int
    ) -> tuple[list[list[str]], int, int, TranslateStats]:
        stats = TranslateStats()
        if not jobs:
            return [[] for _ in range(n_requests)], 0, 0, stats

        results: dict[tuple[int, int], str] = {}
        in_tok = 0
        out_tok = 0
        try:
            for batch in self._plan_batches(jobs):
                texts = [job.text for job in batch]
                occupancy = len(batch) / max(self.max_batch_size, 1)
                stats.occupancy_sum += occupancy
                stats.occupancy_n += 1
                if self.max_batch_size <= 1 or len(batch) == 1:
                    piece, one_in, one_out, batch_stats = self._generate_one(texts[0])
                    pieces = [piece]
                    in_tok += one_in
                    out_tok += one_out
                else:
                    pieces, batch_in, batch_out, batch_stats = self._generate_batch(texts)
                    in_tok += batch_in
                    out_tok += batch_out
                stats.generate_calls += 1
                stats.batches.append(batch_stats)
                for job, piece in zip(batch, pieces):
                    results[(job.request_id, job.chunk_index)] = piece
                    if self.engine._is_degenerate(piece, job.text, self.target_language):
                        raise ValueError("degenerate translation output")
        except Exception as exc:
            stats.error = repr(exc)
            raise

        by_request: list[list[str]] = []
        for req_id in range(n_requests):
            n_chunks = 1 + max(
                (job.chunk_index for job in jobs if job.request_id == req_id),
                default=-1,
            )
            by_request.append(
                [results[(req_id, idx)] for idx in range(n_chunks)]
            )
        return by_request, in_tok, out_tok, stats

    def _plan_batches(self, jobs: list[ChunkJob]) -> list[list[ChunkJob]]:
        groups: dict[str, list[ChunkJob]] = {}
        ordered_keys: list[str] = []
        for job in jobs:
            key = bucket_name(job.input_token_count) if self.use_buckets else "all"
            if key not in groups:
                groups[key] = []
                ordered_keys.append(key)
            groups[key].append(job)

        batches: list[list[ChunkJob]] = []
        for key in ordered_keys:
            remaining = list(groups[key])
            while remaining:
                batch: list[ChunkJob] = []
                while remaining:
                    candidate = remaining[0]
                    trial = batch + [candidate]
                    if len(trial) > self.max_batch_size:
                        break
                    pad_len = max(job.input_token_count for job in trial)
                    padded = pad_len * len(trial)
                    if (
                        self.token_budget is not None
                        and batch
                        and padded > self.token_budget
                    ):
                        break
                    remaining.pop(0)
                    batch = trial
                if not batch:
                    batch = [remaining.pop(0)]
                batches.append(batch)
        return batches

    def _generate_one(self, text: str) -> tuple[str, int, int, BatchStats]:
        import time

        inputs = self.engine._encode_translation_inputs(text, self.target_language)
        in_tok = int(inputs["input_ids"].shape[1])
        max_new = max_new_tokens_for(in_tok)
        decoder_start = self.engine._model.config.decoder_start_token_id
        _sync()
        t0 = time.perf_counter()
        with self.engine._lock:
            with torch.inference_mode():
                outputs = self.engine._model.generate(
                    input_ids=inputs["input_ids"],
                    attention_mask=inputs["attention_mask"],
                    max_new_tokens=max_new,
                    num_beams=1,
                    do_sample=False,
                    decoder_start_token_id=decoder_start,
                    pad_token_id=self.engine._tokenizer.pad_token_id,
                    eos_token_id=self.engine._tokenizer.eos_token_id,
                )
        _sync()
        generate_s = time.perf_counter() - t0
        piece = self.engine._tokenizer.decode(
            outputs[0], skip_special_tokens=True
        ).strip()
        out_tok = int(outputs.shape[1])
        stats = BatchStats(
            size=1,
            actual_tokens=in_tok,
            padded_tokens=in_tok,
            padding_ratio=0.0,
            per_chunk_max_new=[max_new],
            batch_max_new=max_new,
            generate_s=generate_s,
        )
        if self.verbose:
            print(f"[EXP] one {in_tok}->{out_tok}: {piece[:80]!r}", flush=True)
        return piece, in_tok, out_tok, stats

    def _generate_batch(self, chunks: list[str]) -> tuple[list[str], int, int, BatchStats]:
        import time

        lang = f"<2{self.target_language}>"
        encoded = self.engine._tokenizer(
            [f"{lang} {chunk}" for chunk in chunks],
            return_tensors="pt",
            truncation=True,
            max_length=512,
            add_special_tokens=True,
            padding=True,
        )
        encoded = {key: value.to(self.engine._device) for key, value in encoded.items()}
        in_toks = [int(n) for n in encoded["attention_mask"].sum(dim=1).tolist()]
        per_max = [max_new_tokens_for(n) for n in in_toks]
        batch_max = max(per_max)
        actual = sum(in_toks)
        padded = int(encoded["input_ids"].numel())
        pad_ratio = 0.0 if padded == 0 else 1.0 - (actual / padded)
        decoder_start = self.engine._model.config.decoder_start_token_id
        pad_id = self.engine._tokenizer.pad_token_id
        _sync()
        t0 = time.perf_counter()
        with self.engine._lock:
            with torch.inference_mode():
                outputs = self.engine._model.generate(
                    input_ids=encoded["input_ids"],
                    attention_mask=encoded["attention_mask"],
                    max_new_tokens=batch_max,
                    num_beams=1,
                    do_sample=False,
                    decoder_start_token_id=decoder_start,
                    pad_token_id=pad_id,
                    eos_token_id=self.engine._tokenizer.eos_token_id,
                )
        _sync()
        generate_s = time.perf_counter() - t0
        pieces: list[str] = []
        out_tok = 0
        for i, seq in enumerate(outputs):
            piece = self.engine._tokenizer.decode(seq, skip_special_tokens=True).strip()
            pieces.append(piece)
            if pad_id is None:
                out_tok += int(seq.shape[0])
            else:
                out_tok += int((seq != pad_id).sum().item())
            if self.verbose:
                print(
                    f"[EXP] batch[{i}] {in_toks[i]}->{int(seq.shape[0])}: {piece[:80]!r}",
                    flush=True,
                )
        stats = BatchStats(
            size=len(chunks),
            actual_tokens=actual,
            padded_tokens=padded,
            padding_ratio=pad_ratio,
            per_chunk_max_new=per_max,
            batch_max_new=batch_max,
            generate_s=generate_s,
        )
        return pieces, actual, out_tok, stats


def timed_paragraph(
    translator: ExperimentalTranslator, text: str
) -> dict[str, Any]:
    import time

    _sync()
    t0 = time.perf_counter()
    translation, in_tok, out_tok, stats = translator.translate_paragraph(text)
    _sync()
    wall_s = time.perf_counter() - t0
    return {
        "translation": translation,
        "wall_s": wall_s,
        "input_chars": len(text),
        "output_chars": len(translation),
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "tokens_per_sec": (out_tok / wall_s) if wall_s else 0.0,
        "chars_per_sec": (len(translation) / wall_s) if wall_s else 0.0,
        "stats": stats.as_dict(),
    }


def timed_paragraphs(
    translator: ExperimentalTranslator, paragraphs: list[str]
) -> dict[str, Any]:
    import time

    _sync()
    t0 = time.perf_counter()
    translations, in_tok, out_tok, stats = translator.translate_paragraphs(paragraphs)
    _sync()
    wall_s = time.perf_counter() - t0
    total_chars = sum(len(p) for p in paragraphs)
    out_chars = sum(len(t) for t in translations)
    return {
        "translations": translations,
        "wall_s": wall_s,
        "paragraphs": len(paragraphs),
        "paragraphs_per_sec": (len(paragraphs) / wall_s) if wall_s else 0.0,
        "input_chars": total_chars,
        "output_chars": out_chars,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "tokens_per_sec": (out_tok / wall_s) if wall_s else 0.0,
        "chars_per_sec": (out_chars / wall_s) if wall_s else 0.0,
        "stats": stats.as_dict(),
    }
