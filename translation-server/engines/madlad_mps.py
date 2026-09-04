"""MADLAD-400 translation engine - MPS Optimized Version

This version prioritizes MPS (Metal Performance Shaders) for Apple Silicon,
with automatic dtype selection and fallback to CPU if needed.
"""
import os
import re
import threading
import time
from typing import Optional
import platform
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from .base import TranslationEngine, TranslationResult, EngineStatus


class MADLADEngine(TranslationEngine):
    """
    Translation engine using Google's MADLAD-400 model.
    
    Optimized for Apple Silicon (M4) with MPS support.
    Falls back to CPU only if MPS is unavailable or fails.
    """

    MODEL_ID = "google/madlad400-3b-mt"
    MODEL_VERSION = "3b-mt-v4"

    def __init__(self, device: Optional[str] = None, dtype: Optional[torch.dtype] = None):
        """
        Initialize the MADLAD engine.
        
        Args:
            device: Device to use ("mps", "cuda", "cpu", or None for auto-detect)
            dtype: Data type to use (torch.bfloat16, torch.float16, torch.float32, or None for auto)
        """
        self._model = None
        self._tokenizer = None
        self._device_str = device
        self._device = None
        self._dtype = dtype
        self._model_loaded = False
        self._load_time = 0.0
        # MPS is not safe for concurrent generate() — the original SIGSEGV
        # happened with two /translate requests on Metal at once.
        self._lock = threading.Lock()
        # Independent sentence chunks in one generate() call. 1 disables batching.
        # Sweep 2026-09-04: 24 is slightly faster than 8 on long paragraphs and
        # matches 12/32 quality. 1 restores one generate() per chunk.
        self._batch_size = max(1, int(os.environ.get("MADLAD_BATCH_SIZE", "24")))
        
        # Enable MPS fallback for unsupported operations
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        
        # ログ出力
        self._log_environment()

    def _log_environment(self) -> None:
        """Log detailed environment information."""
        print("\n" + "=" * 80)
        print("MADLAD ENGINE ENVIRONMENT")
        print("=" * 80)
        print(f"Python version: {platform.python_version()}")
        print(f"Platform: {platform.platform()}")
        print(f"Machine: {platform.machine()}")
        
        if platform.system() == "Darwin":
            print(f"macOS version: {platform.mac_ver()[0]}")
        
        print(f"PyTorch version: {torch.__version__}")
        print(f"MPS built: {torch.backends.mps.is_built()}")
        print(f"MPS available: {torch.backends.mps.is_available()}")
        print(f"CUDA available: {torch.cuda.is_available()}")
        print(f"MPS fallback enabled: {os.getenv('PYTORCH_ENABLE_MPS_FALLBACK', '0')}")
        print("=" * 80 + "\n")

    def _detect_device(self) -> torch.device:
        """
        Detect the best available device.
        
        Priority:
        1. MPS (Apple Silicon GPU) - best for M4 Mac
        2. CUDA (NVIDIA GPU)
        3. CPU (fallback only)
        """
        if torch.backends.mps.is_available():
            print("[DEVICE] Using MPS (Apple Silicon GPU)")
            return torch.device("mps")
        elif torch.cuda.is_available():
            print("[DEVICE] Using CUDA (NVIDIA GPU)")
            return torch.device("cuda")
        else:
            print("[DEVICE] Using CPU (no GPU available)")
            return torch.device("cpu")

    def _select_dtype(self, device: torch.device) -> torch.dtype:
        """
        Select optimal dtype for the device.
        
        For MPS:
        1. Try bfloat16 (best speed/quality tradeoff)
        2. Fallback to float16 if bfloat16 fails
        3. Fallback to float32 if both fail
        
        For CUDA:
        - Use float16 (standard for inference)
        
        For CPU:
        - Use float32 (CPU doesn't benefit from lower precision)
        """
        if device.type == "mps":
            # Try bfloat16 first (recommended for Apple Silicon)
            print("[DTYPE] Selecting bfloat16 for MPS")
            return torch.bfloat16
        elif device.type == "cuda":
            print("[DTYPE] Selecting float16 for CUDA")
            return torch.float16
        else:
            print("[DTYPE] Selecting float32 for CPU")
            return torch.float32

    def load_model(self) -> None:
        """Load the MADLAD model and tokenizer."""
        with self._lock:
            self._load_model_unlocked()

    def _load_model_unlocked(self) -> None:
        """Load the model. Caller must hold self._lock."""
        if self._model_loaded:
            print("[DEBUG] Model already loaded, skipping...")
            return

        print(f"\n[LOADING] MADLAD-400 model from {self.MODEL_ID}")
        load_start = time.time()

        try:
            # Detect device
            if self._device_str:
                self._device = torch.device(self._device_str)
                print(f"[DEVICE] Using specified device: {self._device}")
            else:
                self._device = self._detect_device()
            
            # Select dtype
            if self._dtype is None:
                self._dtype = self._select_dtype(self._device)
            else:
                print(f"[DTYPE] Using specified dtype: {self._dtype}")
            
            print(f"[CONFIG] Device: {self._device}, Dtype: {self._dtype}")
            
            # Load tokenizer. Language tags like <2ja> must remain whole tokens.
            print("[LOADING] Loading tokenizer...")
            self._tokenizer = AutoTokenizer.from_pretrained(
                self.MODEL_ID,
                use_fast=False,
            )
            self._tokenizer.padding_side = "right"
            print("[LOADING] ✓ Tokenizer loaded")
            
            # Load model with selected dtype
            print(f"[LOADING] Loading model with dtype={self._dtype}...")
            
            self._model = AutoModelForSeq2SeqLM.from_pretrained(
                self.MODEL_ID,
                dtype=self._dtype,
                low_cpu_mem_usage=True,
            )
            # Transformers 5 silently binds MADLAD-3B encoder embeddings to
            # lm_head. Encoder/decoder inputs must share decoder.embed_tokens;
            # lm_head stays separate. huggingface/transformers#48154
            self._repair_madlad_embeddings()
            
            # Move to device
            print(f"[LOADING] Moving model to {self._device}...")
            self._model = self._model.to(self._device)
            self._model.eval()
            
            # Verify
            actual_device = next(self._model.parameters()).device
            actual_dtype = next(self._model.parameters()).dtype
            print(f"[LOADING] ✓ Model on device: {actual_device}")
            print(f"[LOADING] ✓ Model dtype: {actual_dtype}")
            
            self._model_loaded = True
            self._load_time = time.time() - load_start
            
            print(f"[LOADING] ✓ Model loaded successfully in {self._load_time:.2f}s\n")
            
        except Exception as e:
            print(f"[ERROR] Failed to load model: {e}")
            import traceback
            traceback.print_exc()
            
            # Fallback to CPU if MPS fails
            if self._device and self._device.type == "mps":
                print("\n[FALLBACK] MPS failed, trying CPU...")
                self._device = torch.device("cpu")
                self._dtype = torch.float32
                self._model = None
                self._tokenizer = None
                self._load_model_unlocked()
            else:
                raise

    def unload_model(self) -> None:
        """Unload the model from memory."""
        if self._model is not None:
            del self._model
            self._model = None
        if self._tokenizer is not None:
            del self._tokenizer
            self._tokenizer = None
        self._model_loaded = False
        
        # Clear cache
        if self._device and self._device.type == "mps":
            torch.mps.empty_cache()
        elif torch.cuda.is_available():
            torch.cuda.empty_cache()

    def translate(
        self,
        text: str,
        source_language: str,
        target_language: str,
    ) -> TranslationResult:
        """
        Translate text using MADLAD-400.
        
        MADLAD uses language tags: <2xx> where xx is the language code.
        Example: <2ja> for Japanese, <2en> for English.
        """
        translate_start = time.time()
        model_was_cached = self._model_loaded

        with self._lock:
            if not self._model_loaded:
                self._load_model_unlocked()

            try:
                named = MADLADEngine._format_named_work_heading(text)
                if named and target_language == "ja":
                    translate_time = (time.time() - translate_start) * 1000
                    return TranslationResult(
                        text=named,
                        source_language=source_language,
                        target_language=target_language,
                        model=self.MODEL_ID,
                        model_version=self.MODEL_VERSION,
                        input_chars=len(text),
                        output_chars=len(named),
                        input_tokens=0,
                        output_tokens=0,
                        translation_time_ms=translate_time,
                    )

                heading = re.match(
                    r"^(?P<num>\d+(?:\.\d+)*)[.)]\s+(?P<rest>.+)$",
                    " ".join(text.split()).strip(),
                )
                translate_body = text
                heading_num = None
                if (
                    target_language == "ja"
                    and heading
                    and len(heading.group("rest")) <= 80
                    and heading.group("rest").count(".") == 0
                ):
                    heading_num = heading.group("num")
                    translate_body = heading.group("rest")

                chunks = self._split_for_translation(translate_body)
                print(
                    f"\n[TRANSLATE] Input: {len(text)} chars, {len(chunks)} chunk(s), "
                    f"{source_language} -> {target_language}",
                    flush=True,
                )

                pieces, input_tokens, output_tokens = self._translate_chunks(
                    chunks, target_language
                )

                translated_text = self._join_translated_chunks(
                    chunks, pieces, target_language
                )
                if heading_num:
                    translated_text = f"{heading_num}. {translated_text.lstrip()}"

                if self._is_degenerate(translated_text, text, target_language):
                    print(f"[TRANSLATE] Rejected degenerate output: {translated_text[:120]!r}")
                    raise ValueError("degenerate translation output")

                print(f"[TRANSLATE] Output: {translated_text[:200]!r}", flush=True)

                translate_time = (time.time() - translate_start) * 1000
                tokens_per_sec = (output_tokens / translate_time) * 1000 if translate_time > 0 else 0
                load_time_label = "cached" if model_was_cached else f"{self._load_time:.2f}s"

                print("[MADLAD BENCHMARK]")
                print(f"  device: {self._device}")
                print(f"  dtype: {self._dtype}")
                print(f"  chunks: {len(chunks)}")
                print(f"  batch_size: {self._batch_size}")
                print(f"  input_chars: {len(text)}")
                print(f"  input_tokens: {input_tokens}")
                print(f"  output_tokens: {output_tokens}")
                print(f"  model_load_time: {load_time_label}")
                print(f"  translation_time: {translate_time / 1000:.2f}s")
                print(f"  tokens_per_second: {tokens_per_sec:.2f}")

                return TranslationResult(
                    text=translated_text,
                    source_language=source_language,
                    target_language=target_language,
                    model=self.MODEL_ID,
                    model_version=self.MODEL_VERSION,
                    input_chars=len(text),
                    output_chars=len(translated_text),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    translation_time_ms=translate_time,
                )

            except Exception as e:
                print(f"[ERROR] Translation failed: {e}")
                import traceback
                traceback.print_exc()
                raise

    @staticmethod
    def _format_named_work_heading(text: str) -> str | None:
        compact = " ".join(text.split()).strip()
        match = re.match(
            r"^(?:(?P<num>\d+(?:\.\d+)*)[.)]\s+)?(?P<title>.+?)\s+by\s+(?P<author>[A-Z].+)$",
            compact,
            re.I,
        )
        if not match:
            return None
        author = match.group("author").strip().rstrip(".:;")
        if not author or len(author) > 60 or author.count(" ") > 5:
            return None
        if not re.match(r"^[A-Z][A-Za-z.'’\-]+(?:\s+[A-Z][A-Za-z.'’\-]+){0,5}$", author):
            return None
        title = match.group("title").strip()
        num = match.group("num")
        body = f"{title} ({author})"
        return f"{num}. {body}" if num else body

    @staticmethod
    def _split_for_translation(text: str) -> list[str]:
        """MADLAD-3B greedy decoding drifts on multi-clause academic sentences."""
        compact = " ".join(text.split()).strip()
        if not compact:
            return [text]
        parts = re.split(r'(?<=(?<!\d)[.!?])\s+(?=[A-Z"“(])', compact)
        chunks: list[str] = []
        for part in parts:
            part = part.strip()
            if not part:
                continue
            chunks.extend(MADLADEngine._split_clauses(part))
        return chunks or [compact]

    @staticmethod
    def _split_clauses(part: str) -> list[str]:
        # Only split title-like "Short Title: subtitle". Do not split
        # "extended with portable variations: for example the Walkman".
        if re.search(r":\s+\S", part):
            left, right = re.split(r":\s+", part, maxsplit=1)
            left, right = left.strip(), right.strip()
            continuation = re.match(
                r"^(for example|e\.g\.|i\.e\.|namely|that is|including|see |cf\.)\b",
                right,
                re.I,
            )
            title_like = (
                left
                and right
                and not continuation
                and len(left) <= 80
                and len(left.split()) <= 10
                and not left.endswith((".", "!", "?"))
            )
            if title_like:
                return [left + ":", right]
        if len(part) > 140:
            return [s.strip() for s in re.split(r"(?<=[;])\s+", part) if s.strip()]
        return [part]

    @staticmethod
    def _to_halfwidth_ascii(text: str) -> str:
        """Convert fullwidth digits/latin/symbols (１，：（）) to ASCII.

        Ideographic 。、 remain. This is post-decode and does not add
        MADLAD tokens; ASCII digits are usually fewer tokens, not more.
        """
        out: list[str] = []
        for ch in text:
            code = ord(ch)
            if 0xFF01 <= code <= 0xFF5E:
                out.append(chr(code - 0xFEE0))
            elif code == 0x3000:
                out.append(" ")
            else:
                out.append(ch)
        converted = "".join(out)
        return re.sub(
            r"([,;:])(?=[\u3040-\u30FF\u4E00-\u9FFF])",
            r"\1 ",
            converted,
        )

    @staticmethod
    def _join_translated_chunks(
        chunks: list[str], pieces: list[str], target_language: str
    ) -> str:
        if target_language != "ja":
            return " ".join(pieces).strip()

        out: list[str] = []
        for i, (chunk, piece) in enumerate(zip(chunks, pieces)):
            piece = piece.strip()
            source_end = chunk.rstrip()[-1:] if chunk.rstrip() else ""
            ja_end = piece[-1:] if piece else ""
            if (
                source_end in ".!?"
                and ja_end not in "。！？.!?"
                and not re.fullmatch(r"\d+[.)]", chunk.strip())
            ):
                piece += "。"
            elif (
                source_end not in ".!?"
                and len(chunk) < 80
                and piece.endswith("を")
            ):
                piece = piece[:-1]
            if i > 0:
                prev = chunks[i - 1].rstrip()
                prev_piece = out[-1] if out else ""
                if (
                    prev.endswith(":")
                    and prev_piece
                    and prev_piece[-1] not in "。！？：、:"
                ):
                    out.append(":")
            out.append(piece)
        joined = "".join(out).strip()
        joined = re.sub(r"[:：]+", ":", joined)
        return MADLADEngine._to_halfwidth_ascii(joined)

    def _translate_chunks(
        self, chunks: list[str], target_language: str
    ) -> tuple[list[str], int, int]:
        if self._batch_size <= 1 or len(chunks) <= 1:
            pieces: list[str] = []
            input_tokens = 0
            output_tokens = 0
            for chunk in chunks:
                piece, in_tok, out_tok = self._translate_chunk(chunk, target_language)
                pieces.append(piece)
                input_tokens += in_tok
                output_tokens += out_tok
            return pieces, input_tokens, output_tokens

        pieces = []
        input_tokens = 0
        output_tokens = 0
        for start in range(0, len(chunks), self._batch_size):
            group = chunks[start : start + self._batch_size]
            try:
                group_pieces, in_tok, out_tok = self._translate_chunk_batch(
                    group, target_language
                )
            except Exception as exc:
                print(
                    f"[TRANSLATE] Batch of {len(group)} failed ({exc!r}); "
                    "retrying sequentially",
                    flush=True,
                )
                group_pieces = []
                in_tok = 0
                out_tok = 0
                for chunk in group:
                    piece, one_in, one_out = self._translate_chunk(
                        chunk, target_language
                    )
                    group_pieces.append(piece)
                    in_tok += one_in
                    out_tok += one_out
            pieces.extend(group_pieces)
            input_tokens += in_tok
            output_tokens += out_tok
        return pieces, input_tokens, output_tokens

    def _translate_chunk_batch(
        self, chunks: list[str], target_language: str
    ) -> tuple[list[str], int, int]:
        lang_token = f"<2{target_language}>"
        if self._tokenizer.convert_tokens_to_ids(lang_token) == self._tokenizer.unk_token_id:
            raise ValueError(f"Unknown MADLAD language tag: {lang_token}")

        encoded = self._tokenizer(
            [f"{lang_token} {chunk}" for chunk in chunks],
            return_tensors="pt",
            truncation=True,
            max_length=512,
            add_special_tokens=True,
            padding=True,
        )
        encoded = {key: value.to(self._device) for key, value in encoded.items()}
        in_toks = [int(n) for n in encoded["attention_mask"].sum(dim=1).tolist()]
        max_new_tokens = max(
            min(max(token_count * 3 + 24, 48), 256) for token_count in in_toks
        )
        decoder_start = self._model.config.decoder_start_token_id
        pad_id = self._tokenizer.pad_token_id

        with torch.inference_mode():
            outputs = self._model.generate(
                input_ids=encoded["input_ids"],
                attention_mask=encoded["attention_mask"],
                max_new_tokens=max_new_tokens,
                num_beams=1,
                do_sample=False,
                decoder_start_token_id=decoder_start,
                pad_token_id=pad_id,
                eos_token_id=self._tokenizer.eos_token_id,
            )

        pieces: list[str] = []
        output_tokens = 0
        for i, chunk in enumerate(chunks):
            seq = outputs[i]
            piece = self._tokenizer.decode(seq, skip_special_tokens=True).strip()
            if self._is_degenerate(piece, chunk, target_language):
                print(f"[TRANSLATE] Rejected batch chunk: {piece[:120]!r}", flush=True)
                raise ValueError("degenerate translation output")
            print(
                f"[TRANSLATE] batch {in_toks[i]}->{int(seq.shape[0])}: {piece[:120]!r}",
                flush=True,
            )
            pieces.append(piece)
            if pad_id is None:
                output_tokens += int(seq.shape[0])
            else:
                output_tokens += int((seq != pad_id).sum().item())
        return pieces, sum(in_toks), output_tokens

    def _translate_chunk(
        self, text: str, target_language: str
    ) -> tuple[str, int, int]:
        inputs = self._encode_translation_inputs(text, target_language)
        input_tokens = inputs["input_ids"].shape[1]
        max_new_tokens = min(max(input_tokens * 3 + 24, 48), 256)
        decoder_start = self._model.config.decoder_start_token_id

        with torch.inference_mode():
            outputs = self._model.generate(
                input_ids=inputs["input_ids"],
                attention_mask=inputs["attention_mask"],
                max_new_tokens=max_new_tokens,
                num_beams=1,
                do_sample=False,
                decoder_start_token_id=decoder_start,
                pad_token_id=self._tokenizer.pad_token_id,
                eos_token_id=self._tokenizer.eos_token_id,
            )

        translated_text = self._tokenizer.decode(
            outputs[0],
            skip_special_tokens=True,
        ).strip()
        if self._is_degenerate(translated_text, text, target_language):
            print(f"[TRANSLATE] Rejected chunk: {translated_text[:120]!r}", flush=True)
            raise ValueError("degenerate translation output")
        print(f"[TRANSLATE] chunk {input_tokens}->{outputs.shape[1]}: {translated_text[:120]!r}", flush=True)
        return translated_text, input_tokens, int(outputs.shape[1])

    def _repair_madlad_embeddings(self) -> None:
        """Point encoder input embeddings at decoder.embed_tokens, not lm_head."""
        decoder_emb = self._model.decoder.embed_tokens
        self._model.shared = decoder_emb
        self._model.encoder.embed_tokens = decoder_emb
        enc_max = decoder_emb.weight.detach().float().abs().max().item()
        head_max = self._model.lm_head.weight.detach().float().abs().max().item()
        same_ptr = (
            self._model.encoder.embed_tokens.weight.data_ptr()
            == self._model.decoder.embed_tokens.weight.data_ptr()
        )
        print(
            f"[LOADING] embedding repair: input absmax={enc_max:.2f}, "
            f"lm_head absmax={head_max:.2f}, encoder==decoder={same_ptr}",
            flush=True,
        )
        if enc_max < 10:
            raise RuntimeError("MADLAD input embeddings still look like lm_head")

    def _encode_translation_inputs(
        self, text: str, target_language: str
    ) -> dict[str, torch.Tensor]:
        lang_token = f"<2{target_language}>"
        if self._tokenizer.convert_tokens_to_ids(lang_token) == self._tokenizer.unk_token_id:
            raise ValueError(f"Unknown MADLAD language tag: {lang_token}")

        encoded = self._tokenizer(
            f"{lang_token} {text}",
            return_tensors="pt",
            truncation=True,
            max_length=512,
            add_special_tokens=True,
            padding=False,
        )
        return {k: v.to(self._device) for k, v in encoded.items()}

    @staticmethod
    def _is_degenerate(output: str, source: str, target_language: str) -> bool:
        compact = "".join(output.split())
        if not compact:
            return True
        if re.search(r"(.)\1{7,}", compact):
            return True
        if re.search(r"[\u0e00-\u0e7f]", output):
            return True
        counts: dict[str, int] = {}
        for ch in compact:
            counts[ch] = counts.get(ch, 0) + 1
        if len(compact) >= 16 and max(counts.values()) / len(compact) > 0.4:
            return True
        if target_language == "ja":
            has_kana = bool(re.search(r"[\u3040-\u30ff]", output))
            has_kanji = bool(re.search(r"[\u4e00-\u9fff]", output))
            if not has_kana and not has_kanji:
                return True
            if len(source) >= 40 and has_kanji and not has_kana:
                return True
            latin = len(re.findall(r"[A-Za-z]", output))
            if len(output) >= 16 and latin / len(output) > 0.45:
                return True
            if re.search(r"\d{4}-\d{2}-\d{2}", output) and not re.search(
                r"\d{4}-\d{2}-\d{2}", source
            ):
                return True
        return False

    def get_status(self) -> EngineStatus:
        """Get the current status of the engine."""
        device_str = str(self._device) if self._device else "not initialized"
        
        return EngineStatus(
            available=True,
            model_loaded=self._model_loaded,
            model_name=self.MODEL_ID,
            model_version=self.MODEL_VERSION,
            device=device_str,
        )

    @property
    def model_name(self) -> str:
        return self.MODEL_ID

    @property
    def model_version(self) -> str:
        return self.MODEL_VERSION


# Singleton instance for reuse
_engine_instance: Optional[MADLADEngine] = None


def get_engine() -> MADLADEngine:
    """Get the singleton MADLAD engine instance."""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = MADLADEngine()
    return _engine_instance
