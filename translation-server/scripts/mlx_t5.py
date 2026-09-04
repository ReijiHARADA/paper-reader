"""T5 / MADLAD encoder-decoder for MLX.

Adapted from mlx-examples/t5/t5.py. Adds INT8 affine load for
aufklarer/MADLAD400-3B-MT-MLX (gated-gelu, untied lm_head).
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import List, Optional, Tuple

import mlx.core as mx
import mlx.nn as nn
import numpy as np


def _relative_position_bucket(
    relative_position, bidirectional=True, num_buckets=32, max_distance=128
):
    relative_buckets = 0
    if bidirectional:
        num_buckets //= 2
        relative_buckets += (relative_position > 0).astype(mx.int16) * num_buckets
        relative_position = mx.abs(relative_position)
    else:
        relative_position = -mx.minimum(
            relative_position, mx.zeros_like(relative_position)
        )

    max_exact = num_buckets // 2
    is_small = relative_position < max_exact
    scale = (num_buckets - max_exact) / np.log(max_distance / max_exact)
    relative_position_if_large = max_exact + (
        mx.log(relative_position.astype(mx.float32) / max_exact) * scale
    ).astype(mx.int16)
    relative_position_if_large = mx.minimum(relative_position_if_large, num_buckets - 1)
    relative_buckets += mx.where(is_small, relative_position, relative_position_if_large)
    return relative_buckets


class RelativePositionBias(nn.Module):
    def __init__(self, config, bidirectional: bool):
        self.bidirectional = bidirectional
        self.num_buckets = config.relative_attention_num_buckets
        self.max_distance = getattr(config, "relative_attention_max_distance", 128)
        self.n_heads = config.num_heads
        self.embeddings = nn.Embedding(
            config.relative_attention_num_buckets, config.num_heads
        )

    def __call__(self, query_length: int, key_length: int, offset: int = 0):
        context_position = mx.arange(offset, query_length)[:, None]
        memory_position = mx.arange(key_length)[None, :]
        relative_position = memory_position - context_position
        relative_position_bucket = _relative_position_bucket(
            relative_position,
            bidirectional=self.bidirectional,
            num_buckets=self.num_buckets,
            max_distance=self.max_distance,
        )
        values = self.embeddings(relative_position_bucket)
        return values.transpose(2, 0, 1)


class MultiHeadAttention(nn.Module):
    def __init__(self, config):
        super().__init__()
        inner_dim = config.d_kv * config.num_heads
        self.num_heads = config.num_heads
        self.query_proj = nn.Linear(config.d_model, inner_dim, bias=False)
        self.key_proj = nn.Linear(config.d_model, inner_dim, bias=False)
        self.value_proj = nn.Linear(config.d_model, inner_dim, bias=False)
        self.out_proj = nn.Linear(inner_dim, config.d_model, bias=False)

    def __call__(
        self,
        queries: mx.array,
        keys: mx.array,
        values: mx.array,
        mask: Optional[mx.array],
        cache: Optional[Tuple[mx.array, mx.array]] = None,
    ):
        queries = self.query_proj(queries)
        keys = self.key_proj(keys)
        values = self.value_proj(values)

        num_heads = self.num_heads
        B, L, _ = queries.shape
        _, S, _ = keys.shape
        queries = queries.reshape(B, L, num_heads, -1).transpose(0, 2, 1, 3)
        keys = keys.reshape(B, S, num_heads, -1).transpose(0, 2, 3, 1)
        values = values.reshape(B, S, num_heads, -1).transpose(0, 2, 1, 3)

        if cache is not None:
            key_cache, value_cache = cache
            keys = mx.concatenate([key_cache, keys], axis=3)
            values = mx.concatenate([value_cache, values], axis=2)

        scores = queries @ keys
        if mask is not None:
            scores = scores + mask.astype(scores.dtype)

        scores = mx.softmax(scores.astype(mx.float32), axis=-1).astype(scores.dtype)
        values_hat = (scores @ values).transpose(0, 2, 1, 3).reshape(B, L, -1)
        return self.out_proj(values_hat), (keys, values)


class DenseActivation(nn.Module):
    def __init__(self, config):
        super().__init__()
        mlp_dims = config.d_ff or config.d_model * 4
        self.gated = hasattr(config, "feed_forward_proj")
        activation = (
            "relu"
            if not self.gated
            else config.feed_forward_proj.removeprefix("gated-")
        )
        if self.gated:
            self.wi_0 = nn.Linear(config.d_model, mlp_dims, bias=False)
            self.wi_1 = nn.Linear(config.d_model, mlp_dims, bias=False)
        else:
            self.wi = nn.Linear(config.d_model, mlp_dims, bias=False)
        self.wo = nn.Linear(mlp_dims, config.d_model, bias=False)
        if activation == "relu":
            self.act = nn.relu
        elif activation == "gelu":
            self.act = nn.gelu
        elif activation == "silu":
            self.act = nn.silu
        else:
            raise ValueError(f"Unknown activation: {activation}")

    def __call__(self, x):
        if self.gated:
            hidden_act = self.act(self.wi_0(x))
            hidden_linear = self.wi_1(x)
            x = hidden_act * hidden_linear
        else:
            x = self.act(self.wi(x))
        return self.wo(x)


class TransformerEncoderLayer(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.attention = MultiHeadAttention(config)
        self.ln1 = nn.RMSNorm(config.d_model, eps=config.layer_norm_epsilon)
        self.ln2 = nn.RMSNorm(config.d_model, eps=config.layer_norm_epsilon)
        self.dense = DenseActivation(config)

    def __call__(self, x, mask):
        y = self.ln1(x)
        y, _ = self.attention(y, y, y, mask=mask)
        x = x + y
        y = self.ln2(x)
        y = self.dense(y)
        return x + y


class TransformerEncoder(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.layers = [TransformerEncoderLayer(config) for _ in range(config.num_layers)]
        self.ln = nn.RMSNorm(config.d_model, eps=config.layer_norm_epsilon)
        self.relative_attention_bias = RelativePositionBias(config, bidirectional=True)

    def __call__(self, x: mx.array):
        pos_bias = self.relative_attention_bias(x.shape[1], x.shape[1])
        for layer in self.layers:
            x = layer(x, mask=pos_bias)
        return self.ln(x)


class TransformerDecoderLayer(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.self_attention = MultiHeadAttention(config)
        self.cross_attention = MultiHeadAttention(config)
        self.ln1 = nn.RMSNorm(config.d_model, eps=config.layer_norm_epsilon)
        self.ln2 = nn.RMSNorm(config.d_model, eps=config.layer_norm_epsilon)
        self.ln3 = nn.RMSNorm(config.d_model, eps=config.layer_norm_epsilon)
        self.dense = DenseActivation(config)

    def __call__(
        self,
        x: mx.array,
        memory: mx.array,
        mask: mx.array,
        memory_mask: mx.array,
        cache: Optional[List[Tuple[mx.array, mx.array]]] = None,
    ):
        y = self.ln1(x)
        y, cache = self.self_attention(y, y, y, mask, cache)
        x = x + y
        y = self.ln2(x)
        y, _ = self.cross_attention(y, memory, memory, memory_mask)
        x = x + y
        y = self.ln3(x)
        y = self.dense(y)
        return x + y, cache


class TransformerDecoder(nn.Module):
    def __init__(self, config):
        super().__init__()
        n_layers = getattr(config, "num_decoder_layers", config.num_layers)
        self.layers = [TransformerDecoderLayer(config) for _ in range(n_layers)]
        self.ln = nn.RMSNorm(config.d_model, eps=config.layer_norm_epsilon)
        self.relative_attention_bias = RelativePositionBias(config, bidirectional=False)

    def __call__(self, x, memory, mask, memory_mask, cache=None):
        if cache is not None:
            offset = cache[0][0].shape[3]
        else:
            offset = 0
            cache = [None] * len(self.layers)

        T = offset + x.shape[1]
        pos_bias = self.relative_attention_bias(T, T, offset=offset)
        if mask is not None:
            mask += pos_bias
        else:
            mask = pos_bias

        for e, layer in enumerate(self.layers):
            x, cache[e] = layer(x, memory, mask, memory_mask, cache=cache[e])
        return self.ln(x), cache


class OutputHead(nn.Module):
    def __init__(self, config):
        self.linear = nn.Linear(config.d_model, config.vocab_size, bias=False)

    def __call__(self, inputs):
        return self.linear(inputs)


class T5(nn.Module):
    def __init__(self, config):
        self.wte = nn.Embedding(config.vocab_size, config.d_model)
        self.encoder = TransformerEncoder(config)
        self.decoder = TransformerDecoder(config)
        self.tie_word_embeddings = getattr(config, "tie_word_embeddings", True)
        if not self.tie_word_embeddings:
            self.lm_head = OutputHead(config)
        self.model_dim = config.d_model

    def encode(self, inputs: mx.array):
        return self.encoder(self.wte(inputs))

    def decode(self, inputs: mx.array, memory: mx.array, cache=None):
        inputs = self.wte(inputs)
        T = inputs.shape[1]
        if T > 1:
            mask = nn.MultiHeadAttention.create_additive_causal_mask(T)
            mask = mask.astype(inputs.dtype)
        else:
            mask = None

        y, cache = self.decoder(
            inputs, memory=memory, mask=mask, memory_mask=None, cache=cache
        )
        if not self.tie_word_embeddings:
            y = self.lm_head(y)
        else:
            y *= self.model_dim**-0.5
            y = y @ self.wte.weight.T
        return y, cache

    @classmethod
    def sanitize(cls, weights):
        shared_replacement_patterns = [
            (".block.", ".layers."),
            (".k.", ".key_proj."),
            (".o.", ".out_proj."),
            (".q.", ".query_proj."),
            (".v.", ".value_proj."),
            ("shared.", "wte."),
            ("lm_head.", "lm_head.linear."),
            (".layer.0.layer_norm.", ".ln1."),
            (".layer.1.layer_norm.", ".ln2."),
            (".layer.2.layer_norm.", ".ln3."),
            (".final_layer_norm.", ".ln."),
            (
                "layers.0.layer.0.SelfAttention.relative_attention_bias.",
                "relative_attention_bias.embeddings.",
            ),
        ]
        encoder_replacement_patterns = [
            (".layer.0.SelfAttention.", ".attention."),
            (".layer.1.DenseReluDense.", ".dense."),
        ]
        decoder_replacement_patterns = [
            (".layer.0.SelfAttention.", ".self_attention."),
            (".layer.1.EncDecAttention.", ".cross_attention."),
            (".layer.2.DenseReluDense.", ".dense."),
        ]
        ignored_keys = [
            "decoder.layers.0.cross_attention.relative_attention_bias.weight"
        ]

        def replace_key(key: str) -> str:
            for old, new in shared_replacement_patterns:
                key = key.replace(old, new)
            if key.startswith("encoder."):
                for old, new in encoder_replacement_patterns:
                    key = key.replace(old, new)
            elif key.startswith("decoder."):
                for old, new in decoder_replacement_patterns:
                    key = key.replace(old, new)
            return key

        weights = {replace_key(k): v for k, v in weights.items()}
        for key in ignored_keys:
            weights.pop(key, None)
        return weights

    @classmethod
    def from_int8_dir(cls, model_dir: Path) -> "T5":
        with open(model_dir / "config.json", "r") as f:
            raw = json.load(f)
        raw.setdefault("feed_forward_proj", "gated-gelu")
        raw.pop("quantization", None)
        config = SimpleNamespace(**raw)

        model = T5(config)

        def should_quantize(path: str, module: nn.Module):
            if "relative_attention_bias" in path:
                return False
            return hasattr(module, "to_quantized")

        nn.quantize(model, group_size=64, bits=8, class_predicate=should_quantize)

        weights = mx.load(str(model_dir / "model.safetensors"))
        weights = cls.sanitize(weights)
        model.load_weights(list(weights.items()), strict=True)
        mx.eval(model.parameters())
        return model
