"""
ベンチマーク比較スクリプト

CPU版とMPS版のMADLAD翻訳性能を比較します。

使用方法:
  cd translation-server
  source .venv/bin/activate
  python benchmark_comparison.py
"""

import sys
import time
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

MODEL_ID = "google/madlad400-3b-mt"

# テストケース
TEST_TEXT = "Attention is all you need introduced the Transformer architecture for neural machine translation."
TEST_SOURCE = "en"
TEST_TARGET = "ja"

print("=" * 80)
print("MADLAD-400 Benchmark Comparison")
print("=" * 80)
print()
print(f"Test text: {TEST_TEXT}")
print(f"Input length: {len(TEST_TEXT)} chars")
print()

# ==============================================================================
# 結果格納用
# ==============================================================================
results = []

# ==============================================================================
# CPU Benchmark
# ==============================================================================
print("[CPU BENCHMARK]")
print("-" * 80)

try:
    device_cpu = torch.device("cpu")
    dtype_cpu = torch.float32
    
    print(f"Device: {device_cpu}")
    print(f"Dtype: {dtype_cpu}")
    
    # Load
    print("Loading model...")
    load_start = time.time()
    
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, use_fast=True)
    model_cpu = AutoModelForSeq2SeqLM.from_pretrained(
        MODEL_ID,
        dtype=dtype_cpu,
        low_cpu_mem_usage=True,
    )
    model_cpu = model_cpu.to(device_cpu)
    model_cpu.eval()
    
    load_time_cpu = time.time() - load_start
    print(f"✓ Loaded in {load_time_cpu:.2f}s")
    
    # Translate
    print("Translating...")
    input_text = f"<2{TEST_TARGET}> {TEST_TEXT}"
    inputs = tokenizer(input_text, return_tensors="pt", padding=True, truncation=True, max_length=512).to(device_cpu)
    input_tokens = inputs["input_ids"].shape[1]
    
    translate_start = time.time()
    with torch.no_grad():
        outputs = model_cpu.generate(
            **inputs,
            max_new_tokens=512,
            num_beams=1,
            do_sample=False,
        )
    translate_time_cpu = time.time() - translate_start
    
    output_tokens_cpu = outputs.shape[1]
    translated_cpu = tokenizer.decode(outputs[0], skip_special_tokens=True)
    tokens_per_sec_cpu = output_tokens_cpu / translate_time_cpu
    
    print(f"✓ Translated in {translate_time_cpu:.2f}s")
    print(f"  Output tokens: {output_tokens_cpu}")
    print(f"  Tokens/sec: {tokens_per_sec_cpu:.2f}")
    print(f"  Output: {translated_cpu[:100]}...")
    
    results.append({
        "name": "CPU fp32",
        "device": "cpu",
        "dtype": "fp32",
        "load_time": load_time_cpu,
        "translate_time": translate_time_cpu,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens_cpu,
        "tokens_per_sec": tokens_per_sec_cpu,
        "translation": translated_cpu,
        "stable": True,
    })
    
    # Cleanup
    del model_cpu
    
except Exception as e:
    print(f"❌ CPU benchmark failed: {e}")
    results.append({
        "name": "CPU fp32",
        "stable": False,
        "error": str(e),
    })

print()

# ==============================================================================
# MPS Benchmark (各dtype)
# ==============================================================================
if torch.backends.mps.is_available():
    dtypes_to_test = [
        ("bfloat16", torch.bfloat16),
        ("float16", torch.float16),
        ("float32", torch.float32),
    ]
    
    for dtype_name, dtype in dtypes_to_test:
        print(f"[MPS BENCHMARK - {dtype_name.upper()}]")
        print("-" * 80)
        
        try:
            device_mps = torch.device("mps")
            
            print(f"Device: {device_mps}")
            print(f"Dtype: {dtype}")
            
            # Load
            print("Loading model...")
            load_start = time.time()
            
            model_mps = AutoModelForSeq2SeqLM.from_pretrained(
                MODEL_ID,
                dtype=dtype,
                low_cpu_mem_usage=True,
            )
            model_mps = model_mps.to(device_mps)
            model_mps.eval()
            
            load_time_mps = time.time() - load_start
            print(f"✓ Loaded in {load_time_mps:.2f}s")
            
            # Translate
            print("Translating...")
            inputs_mps = tokenizer(input_text, return_tensors="pt", padding=True, truncation=True, max_length=512)
            inputs_mps = {k: v.to(device_mps) for k, v in inputs_mps.items()}
            
            translate_start = time.time()
            with torch.no_grad():
                outputs_mps = model_mps.generate(
                    **inputs_mps,
                    max_new_tokens=512,
                    num_beams=1,
                    do_sample=False,
                )
            translate_time_mps = time.time() - translate_start
            
            output_tokens_mps = outputs_mps.shape[1]
            translated_mps = tokenizer.decode(outputs_mps[0], skip_special_tokens=True)
            tokens_per_sec_mps = output_tokens_mps / translate_time_mps
            
            print(f"✓ Translated in {translate_time_mps:.2f}s")
            print(f"  Output tokens: {output_tokens_mps}")
            print(f"  Tokens/sec: {tokens_per_sec_mps:.2f}")
            print(f"  Output: {translated_mps[:100]}...")
            
            results.append({
                "name": f"MPS {dtype_name}",
                "device": "mps",
                "dtype": dtype_name,
                "load_time": load_time_mps,
                "translate_time": translate_time_mps,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens_mps,
                "tokens_per_sec": tokens_per_sec_mps,
                "translation": translated_mps,
                "stable": True,
            })
            
            # Cleanup
            del model_mps
            torch.mps.empty_cache()
            
        except Exception as e:
            print(f"❌ MPS {dtype_name} benchmark failed: {e}")
            import traceback
            traceback.print_exc()
            results.append({
                "name": f"MPS {dtype_name}",
                "device": "mps",
                "dtype": dtype_name,
                "stable": False,
                "error": str(e),
            })
        
        print()

else:
    print("[MPS NOT AVAILABLE]")
    print("MPS is not available on this system")
    print()

# ==============================================================================
# サマリー
# ==============================================================================
print("=" * 80)
print("BENCHMARK SUMMARY")
print("=" * 80)
print()

# テーブルヘッダー
print(f"{'Config':<15} {'Load(s)':<10} {'Trans(s)':<10} {'Tokens':<8} {'Tok/s':<10} {'Stable':<8}")
print("-" * 80)

cpu_baseline = None
for r in results:
    if not r.get("stable", False):
        print(f"{r['name']:<15} {'---':<10} {'---':<10} {'---':<8} {'---':<10} {'FAILED':<8}")
        continue
    
    load_t = r.get("load_time", 0)
    trans_t = r.get("translate_time", 0)
    tokens = r.get("output_tokens", 0)
    tok_s = r.get("tokens_per_sec", 0)
    
    speedup = ""
    if r["name"] == "CPU fp32":
        cpu_baseline = trans_t
        speedup = "(baseline)"
    elif cpu_baseline:
        speedup = f"({cpu_baseline / trans_t:.1f}x)"
    
    print(f"{r['name']:<15} {load_t:<10.2f} {trans_t:<10.2f} {tokens:<8} {tok_s:<10.2f} {'✓':<8} {speedup}")

print()

# 推奨設定
print("[RECOMMENDATION]")
stable_mps = [r for r in results if r.get("stable") and r.get("device") == "mps"]
if stable_mps:
    # 最速の設定を選択
    fastest = min(stable_mps, key=lambda x: x.get("translate_time", float("inf")))
    print(f"✓ Use MPS with {fastest['dtype']}")
    print(f"  Speed: {fastest['tokens_per_sec']:.2f} tokens/sec")
    if cpu_baseline:
        print(f"  Speedup: {cpu_baseline / fastest['translate_time']:.1f}x faster than CPU")
else:
    print("! MPS not available or failed - use CPU as fallback")

print()

# CSV出力
print("[CSV FORMAT]")
print("config,device,dtype,load_time,translate_time,output_tokens,tokens_per_sec,stable")
for r in results:
    if r.get("stable"):
        print(f"{r['name']},{r['device']},{r['dtype']},{r['load_time']:.2f},{r['translate_time']:.2f},{r['output_tokens']},{r['tokens_per_sec']:.2f},yes")
    else:
        print(f"{r['name']},{r.get('device', 'unknown')},{r.get('dtype', 'unknown')},0,0,0,0,no")

print()
print("✓ Benchmark complete")
