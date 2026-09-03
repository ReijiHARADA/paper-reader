"""
MPS段階的検証スクリプト

各段階でMPSの動作を確認し、クラッシュする箇所を特定します。

Stage 1: 基本的なTensor演算
Stage 2: モデルロード
Stage 3: Tokenization + MPS転送
Stage 4: 短文生成
Stage 5: 完全な翻訳

使用方法:
  cd translation-server
  source .venv/bin/activate
  PYTORCH_ENABLE_MPS_FALLBACK=1 python test_mps_stages.py
"""

import sys
import platform
import time
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

MODEL_ID = "google/madlad400-3b-mt"

print("=" * 80)
print("MPS Stage-by-Stage Validation")
print("=" * 80)
print()

# 環境情報
print("[ENVIRONMENT]")
print(f"Python: {sys.version.split()[0]}")
print(f"PyTorch: {torch.__version__}")
print(f"Platform: {platform.machine()}")
print(f"Mac OS: {platform.mac_ver()[0]}")
print(f"MPS built: {torch.backends.mps.is_built()}")
print(f"MPS available: {torch.backends.mps.is_available()}")
print()

if not torch.backends.mps.is_available():
    print("❌ MPS is not available on this system")
    sys.exit(1)

# Device設定
device = torch.device("mps")
print(f"✓ Using device: {device}")
print()

# ==============================================================================
# Stage 1: 基本的なTensor演算
# ==============================================================================
print("[STAGE 1] Basic Tensor Operations on MPS")
try:
    # 簡単な演算
    a = torch.randn(100, 100, device=device)
    b = torch.randn(100, 100, device=device)
    c = torch.matmul(a, b)
    
    # CPUへ戻して確認
    result = c.cpu().sum().item()
    print(f"  Matrix multiplication result sum: {result:.2f}")
    print("  ✓ Stage 1 passed")
except Exception as e:
    print(f"  ❌ Stage 1 failed: {e}")
    sys.exit(1)

print()

# ==============================================================================
# Stage 2: モデルロード（各dtype）
# ==============================================================================
print("[STAGE 2] Model Loading on MPS")

dtypes_to_test = [
    ("bfloat16", torch.bfloat16),
    ("float16", torch.float16),
    ("float32", torch.float32),
]

successful_dtype = None
successful_model = None
successful_tokenizer = None

for dtype_name, dtype in dtypes_to_test:
    print(f"\n  Testing dtype: {dtype_name}")
    try:
        # Tokenizer（dtypeに依存しない）
        if successful_tokenizer is None:
            print("    Loading tokenizer...")
            tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, use_fast=True)
            successful_tokenizer = tokenizer
            print("    ✓ Tokenizer loaded")
        
        # Model
        print(f"    Loading model with {dtype_name}...")
        load_start = time.time()
        
        model = AutoModelForSeq2SeqLM.from_pretrained(
            MODEL_ID,
            dtype=dtype,
            low_cpu_mem_usage=True,
        )
        model = model.to(device)
        model.eval()
        
        load_time = time.time() - load_start
        print(f"    ✓ Model loaded in {load_time:.2f}s")
        print(f"    Model device: {next(model.parameters()).device}")
        print(f"    Model dtype: {next(model.parameters()).dtype}")
        
        successful_dtype = dtype_name
        successful_model = model
        break
        
    except Exception as e:
        print(f"    ❌ Failed with {dtype_name}: {e}")
        if successful_model is not None:
            del successful_model
        continue

if successful_model is None:
    print("\n❌ All dtypes failed. Cannot proceed.")
    sys.exit(1)

print(f"\n✓ Stage 2 passed with dtype: {successful_dtype}")
print()

# ==============================================================================
# Stage 3: Tokenization + MPS転送
# ==============================================================================
print("[STAGE 3] Tokenization and MPS Transfer")

test_text = "Hello, world!"
input_text = f"<2ja> {test_text}"

try:
    inputs = successful_tokenizer(
        input_text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=512,
    )
    
    # MPS へ転送
    inputs = {k: v.to(device) for k, v in inputs.items()}
    
    print(f"  Input text: {test_text}")
    print(f"  Input tokens: {inputs['input_ids'].shape[1]}")
    print(f"  Input device: {inputs['input_ids'].device}")
    print("  ✓ Stage 3 passed")
except Exception as e:
    print(f"  ❌ Stage 3 failed: {e}")
    sys.exit(1)

print()

# ==============================================================================
# Stage 4: 短文生成（Very short text）
# ==============================================================================
print("[STAGE 4] Short Text Generation")

try:
    gen_start = time.time()
    
    with torch.no_grad():
        outputs = successful_model.generate(
            **inputs,
            max_new_tokens=50,  # 短めに制限
            num_beams=1,
            do_sample=False,
        )
    
    gen_time = time.time() - gen_start
    
    translated = successful_tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    print(f"  Output tokens: {outputs.shape[1]}")
    print(f"  Generation time: {gen_time:.2f}s")
    print(f"  Output: {translated}")
    print("  ✓ Stage 4 passed")
except Exception as e:
    print(f"  ❌ Stage 4 failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()

# ==============================================================================
# Stage 5: 完全な翻訳（93文字テスト）
# ==============================================================================
print("[STAGE 5] Full Translation (93 chars test)")

test_full = "Attention is all you need introduced the Transformer architecture for neural machine translation."
input_full = f"<2ja> {test_full}"

try:
    inputs_full = successful_tokenizer(
        input_full,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=512,
    ).to(device)
    
    input_tokens = inputs_full['input_ids'].shape[1]
    
    print(f"  Input: {test_full}")
    print(f"  Input chars: {len(test_full)}")
    print(f"  Input tokens: {input_tokens}")
    
    gen_start = time.time()
    
    with torch.no_grad():
        outputs_full = successful_model.generate(
            **inputs_full,
            max_new_tokens=512,  # 現在の設定と同じ
            num_beams=1,
            do_sample=False,
        )
    
    gen_time = time.time() - gen_start
    output_tokens = outputs_full.shape[1]
    tokens_per_sec = output_tokens / gen_time
    
    translated_full = successful_tokenizer.decode(outputs_full[0], skip_special_tokens=True)
    
    print(f"  Output tokens: {output_tokens}")
    print(f"  Generation time: {gen_time:.2f}s")
    print(f"  Tokens/sec: {tokens_per_sec:.2f}")
    print(f"  Output: {translated_full}")
    print("  ✓ Stage 5 passed")
    
except Exception as e:
    print(f"  ❌ Stage 5 failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()

# ==============================================================================
# サマリー
# ==============================================================================
print("=" * 80)
print("MPS VALIDATION SUMMARY")
print("=" * 80)
print(f"All stages passed successfully!")
print(f"Device: {device}")
print(f"Working dtype: {successful_dtype}")
print(f"93-char test:")
print(f"  - Translation time: {gen_time:.2f}s")
print(f"  - Tokens/sec: {tokens_per_sec:.2f}")
print()
print("✓ MPS is working correctly")
print()
print("Next step: Run benchmark comparison")
print("  python benchmark_comparison.py")
