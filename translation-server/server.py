"""
MADLAD Translation Server

A FastAPI server providing translation services using the MADLAD-400 model.
Designed for local execution on Apple Silicon Macs.
"""
import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Optional
import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from engines import get_engine
from engines.micro_batcher import get_scheduler


# Request/Response models
class TranslateRequest(BaseModel):
    text: str = Field(..., description="Text to translate")
    source_language: str = Field(default="en", description="Source language code")
    target_language: str = Field(default="ja", description="Target language code")


class TranslateResponse(BaseModel):
    text: str
    source_language: str
    target_language: str
    model: str
    model_version: str
    input_chars: int
    output_chars: int
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    translation_time_ms: float
    chars_per_sec: float
    tokens_per_sec: Optional[float]


class BatchTranslateRequest(BaseModel):
    texts: list[str] = Field(..., description="List of texts to translate")
    source_language: str = Field(default="en")
    target_language: str = Field(default="ja")


class BatchTranslateResponse(BaseModel):
    results: list[TranslateResponse]
    total_time_ms: float
    total_chars: int
    avg_chars_per_sec: float


class StatusResponse(BaseModel):
    available: bool
    model_loaded: bool
    model_name: str
    model_version: str
    device: str
    error: Optional[str]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


# Translation queue for priority-based processing
@dataclass
class TranslationTask:
    text: str
    source_language: str
    target_language: str
    priority: int  # Lower = higher priority
    future: asyncio.Future


# Lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load MADLAD once so the first /translate is not a 13s wait
    engine = get_engine()
    print("[STARTUP] Preloading MADLAD on MPS (bfloat16)...")
    engine.load_model()
    yield
    engine.unload_model()


# Create FastAPI app
app = FastAPI(
    title="MADLAD Translation Server",
    description="Local translation server using MADLAD-400 3B model",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://localhost:3000",
        "tauri://localhost",
        "https://tauri.localhost",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check if the server is running."""
    engine = get_engine()
    status = engine.get_status()
    return HealthResponse(
        status="ok",
        model_loaded=status.model_loaded,
    )


@app.get("/status", response_model=StatusResponse)
async def get_status():
    """Get the current status of the translation engine."""
    engine = get_engine()
    status = engine.get_status()
    return StatusResponse(**status.to_dict())


@app.post("/load")
async def load_model(background_tasks: BackgroundTasks):
    """Load the translation model into memory."""
    engine = get_engine()
    if engine.get_status().model_loaded:
        return {"message": "Model already loaded"}

    def load():
        engine.load_model()

    background_tasks.add_task(load)
    return {"message": "Model loading started"}


@app.post("/unload")
async def unload_model():
    """Unload the translation model from memory."""
    engine = get_engine()
    engine.unload_model()
    return {"message": "Model unloaded"}


@app.post("/translate", response_model=TranslateResponse)
async def translate(request: TranslateRequest):
    """
    Translate a single text.
    
    The model will be automatically loaded if not already loaded.
    """
    scheduler = get_scheduler()

    try:
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: scheduler.translate(
                request.text,
                request.source_language,
                request.target_language,
            ),
        )
        return TranslateResponse(**result.to_dict())
    except Exception as e:
        import traceback
        error_detail = f"Translation error: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/translate/batch", response_model=BatchTranslateResponse)
async def translate_batch(request: BatchTranslateRequest):
    """Translate multiple texts, packing independent chunks into one generate()."""
    scheduler = get_scheduler()

    import time
    start_time = time.time()

    loop = asyncio.get_event_loop()
    packed = await loop.run_in_executor(
        None,
        lambda: scheduler.translate_many(
            request.texts,
            request.source_language,
            request.target_language,
        ),
    )
    results = []
    total_chars = 0
    for text, result in zip(request.texts, packed):
        results.append(TranslateResponse(**result.to_dict()))
        total_chars += len(text)

    total_time_ms = (time.time() - start_time) * 1000
    avg_chars_per_sec = total_chars / (total_time_ms / 1000) if total_time_ms > 0 else 0

    return BatchTranslateResponse(
        results=results,
        total_time_ms=total_time_ms,
        total_chars=total_chars,
        avg_chars_per_sec=avg_chars_per_sec,
    )


if __name__ == "__main__":
    import os

    host = os.environ.get("MADLAD_SERVER_HOST", "127.0.0.1")
    port = int(os.environ.get("MADLAD_SERVER_PORT", os.environ.get("UVICORN_PORT", "8765")))
    uvicorn.run(
        "server:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )
