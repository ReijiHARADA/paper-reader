#!/usr/bin/env python3
"""Translation server test script"""
import sys
sys.path.insert(0, '.')

from engines.madlad import MADLADEngine

print("=== MADLAD Translation Test ===")
print("Initializing engine...")
engine = MADLADEngine()

print("Loading model...")
try:
    engine.load_model()
    print("✓ Model loaded successfully")
except Exception as e:
    print(f"✗ Model load failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\nTesting translation...")
test_text = "Hello, this is a test."
print(f"Input: {test_text}")

try:
    result = engine.translate(test_text, "en", "ja")
    print(f"✓ Translation succeeded")
    print(f"Output: {result.text}")
    print(f"Time: {result.translation_time_ms:.2f}ms")
except Exception as e:
    print(f"✗ Translation failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n=== Test Complete ===")
