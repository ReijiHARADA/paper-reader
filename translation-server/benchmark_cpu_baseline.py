"""
CPU版MADLAD翻訳ベンチマーク測定スクリプト

使用方法:
  cd translation-server
  source .venv/bin/activate
  python benchmark_cpu_baseline.py
"""

import time
import sys
import platform
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

# テストケース（93文字の英文）
TEST_TEXT = "Attention is all you need introduced the Transformer architecture for neural machine translation."
TEST_SOURCE_LANG = "en"
TEST_TARGET_LANG = "ja"

MODEL_ID = "google/madlad400-3b-mt"

print("=" * 80)
print("MADLAD-400 CPU Baseline Benchmark")
print("=" * 80)
print()

# 環境情報
print("[ENVIRONMENT INFO]")
print(f"Python version: {sys.version}")
print(f"Platform: {platform.platform()}")
print(f"Machine: {platform.machine()}")
print(f"Mac version: {platform.mac_ver()[0]}")
print(f"PyTorch version: {torch.__version__}")
print(f"MPS built: {torch.backends.mps.is_built()}")
print(f"MPS available: {torch.backends.mps.is_available()}")
print(f"CUDA available: {torch.cuda.is_available()}")
print()

# テストケース情報
print("[TEST CASE]")
print(f"Input text: {TEST_TEXT}")
print(f"Input length: {len(TEST_TEXT)} chars")
print(f"Source language: {TEST_SOURCE_LANG}")
print(f"Target language: {TEST_TARGET_LANG}")
print()

# モデルロード
print("[MODEL LOADING]")
device = torch.device("cpu")
dtype = torch.float32

print(f"Device: {device}")
print(f"Dtype: {dtype}")
print(f"Model ID: {MODEL_ID}")
print()

load_start = time.time()

print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, use_fast=True)
print("✓ Tokenizer loaded")

print("Loading model...")
model = AutoModelForSeq2SeqLM.from_pretrained(
    MODEL_ID,
    dtype=dtype,
    low_cpu_mem_usage=True,
)
model = model.to(device)
model.eval()
print("✓ Model loaded")

load_time = time.time() - load_start
print(f"Model load time: {load_time:.2f}s")
print()

# 翻訳実行
print("[TRANSLATION]")
translate_start = time.time()

# Tokenize
input_text = f"<2{TEST_TARGET_LANG}> {TEST_TEXT}"
inputs = tokenizer(
    input_text,
    return_tensors="pt",
    padding=True,
    truncation=True,
    max_length=512,
).to(device)

input_tokens = inputs.input_ids.shape[1]
print(f"Input tokens: {input_tokens}")

# Generate
with torch.no_grad():
    outputs = model.generate(
        **inputs,
        max_new_tokens=512,
        num_beams=1,  # Greedy decoding
        do_sample=False,
    )

output_tokens = outputs.shape[1]
print(f"Output tokens: {output_tokens}")

# Decode
translated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)

translate_time = time.time() - translate_start
tokens_per_sec = output_tokens / translate_time

print(f"Translation time: {translate_time:.2f}s")
print(f"Tokens per second: {tokens_per_sec:.2f}")
print()

print("[OUTPUT]")
print(f"{translated_text}")
print()

# サマリー
print("=" * 80)
print("BENCHMARK SUMMARY")
print("=" * 80)
print(f"{'Device:':<25} {device}")
print(f"{'Dtype:':<25} {dtype}")
print(f"{'Input chars:':<25} {len(TEST_TEXT)}")
print(f"{'Input tokens:':<25} {input_tokens}")
print(f"{'Output tokens:':<25} {output_tokens}")
print(f"{'Model load time:':<25} {load_time:.2f}s")
print(f"{'Translation time:':<25} {translate_time:.2f}s")
print(f"{'Total time:':<25} {load_time + translate_time:.2f}s")
print(f"{'Tokens/sec:':<25} {tokens_per_sec:.2f}")
print()

# CSV形式でも出力（比較用）
print("[CSV FORMAT]")
print("device,dtype,input_chars,input_tokens,output_tokens,load_time,translate_time,tokens_per_sec")
print(f"cpu,fp32,{len(TEST_TEXT)},{input_tokens},{output_tokens},{load_time:.2f},{translate_time:.2f},{tokens_per_sec:.2f}")
print()

print("✓ Benchmark complete")
