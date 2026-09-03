"""MADLAD-400 translation engine using Hugging Face Transformers."""
import time
from typing import Optional
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from .base import TranslationEngine, TranslationResult, EngineStatus


class MADLADEngine(TranslationEngine):
    """
    Translation engine using Google's MADLAD-400 model.
    
    Optimized for Apple Silicon (MPS) but falls back to CPU if needed.
    """

    MODEL_ID = "google/madlad400-3b-mt"
    MODEL_VERSION = "3b-mt"

    def __init__(self, device: Optional[str] = None):
        """
        Initialize the MADLAD engine.
        
        Args:
            device: Device to use ("mps", "cpu", or None for auto-detect)
        """
        self._model = None
        self._tokenizer = None
        self._device = device or self._detect_device()
        self._model_loaded = False

    def _detect_device(self) -> str:
        """
        Detect the best available device.
        
        MPS is disabled due to stability issues with M4 chip.
        Falls back to CPU for reliable execution.
        """
        # DISABLED: MPS has critical stability issues on M4 (Segmentation Fault)
        # if torch.backends.mps.is_available():
        #     return "mps"
        
        if torch.cuda.is_available():
            return "cuda"
        
        print("[INFO] Using CPU for stable execution (MPS disabled due to compatibility issues)")
        return "cpu"

    def load_model(self) -> None:
        """Load the MADLAD model and tokenizer."""
        if self._model_loaded:
            print("[DEBUG] Model already loaded, skipping...")
            return

        print(f"Loading MADLAD-400 model on {self._device}...")
        start_time = time.time()

        try:
            print("[DEBUG] Loading tokenizer...")
            self._tokenizer = AutoTokenizer.from_pretrained(
                self.MODEL_ID,
                use_fast=True,
            )
            print("[DEBUG] Tokenizer loaded successfully")

            # Load model with appropriate settings for the device
            print(f"[DEBUG] Loading model for device: {self._device}")
            
            if self._device == "cuda":
                print("[DEBUG] Loading model with CUDA (fp16)...")
                self._model = AutoModelForSeq2SeqLM.from_pretrained(
                    self.MODEL_ID,
                    dtype=torch.float16,
                    device_map="auto",
                )
            else:  # CPU (MPS disabled)
                print("[DEBUG] Loading model for CPU (fp32)...")
                self._model = AutoModelForSeq2SeqLM.from_pretrained(
                    self.MODEL_ID,
                    dtype=torch.float32,
                    low_cpu_mem_usage=True,  # Memory efficient loading
                )
                self._model = self._model.to(self._device)

            print("[DEBUG] Model loaded, setting eval mode...")
            self._model.eval()
            
            self._model_loaded = True

            elapsed = time.time() - start_time
            print(f"Model loaded successfully in {elapsed:.2f}s")
        except Exception as e:
            print(f"[ERROR] Failed to load model: {str(e)}")
            import traceback
            traceback.print_exc()
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

        # Clear CUDA cache if available
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def translate(
        self,
        text: str,
        source_language: str,
        target_language: str,
    ) -> TranslationResult:
        """
        Translate text using MADLAD-400.
        
        MADLAD uses language tags in the format: <2xx> where xx is the language code.
        For example: <2ja> for Japanese, <2en> for English.
        """
        try:
            if not self._model_loaded:
                self.load_model()

            start_time = time.time()

            # MADLAD format: prepend target language tag
            # The model expects: "<2{target_lang}> {text}"
            input_text = f"<2{target_language}> {text}"
            print(f"[DEBUG] Translating {len(text)} chars from {source_language} to {target_language}")

            # Tokenize
            inputs = self._tokenizer(
                input_text,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=512,
            ).to(self._device)

            input_tokens = inputs.input_ids.shape[1]
            print(f"[DEBUG] Tokenized to {input_tokens} input tokens")

            # Generate translation with optimized settings for speed
            with torch.no_grad():
                outputs = self._model.generate(
                    **inputs,
                    max_new_tokens=512,
                    num_beams=1,  # Use greedy decoding for speed (was 4)
                    do_sample=False,
                    # early_stopping removed as it's only for beam search
                )

            output_tokens = outputs.shape[1]
            print(f"[DEBUG] Generated {output_tokens} output tokens")

            # Decode
            translated_text = self._tokenizer.decode(
                outputs[0],
                skip_special_tokens=True,
            )

            elapsed_ms = (time.time() - start_time) * 1000
            print(f"[DEBUG] Translation completed in {elapsed_ms:.2f}ms")

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
                translation_time_ms=elapsed_ms,
            )
        except Exception as e:
            print(f"[ERROR] Translation failed: {str(e)}")
            import traceback
            traceback.print_exc()
            raise

    def get_status(self) -> EngineStatus:
        """Get the current status of the engine."""
        return EngineStatus(
            available=True,
            model_loaded=self._model_loaded,
            model_name=self.MODEL_ID,
            model_version=self.MODEL_VERSION,
            device=self._device,
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
