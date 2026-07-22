"""
MR 4 — Local Voice Engine (STT via faster-whisper)

Runs entirely on-device. No audio leaves the machine.
Uses CTranslate2-optimised Whisper for real-time transcription
on CPU (int8 quantisation) or GPU (float16) when available.
"""

import logging
import os

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model singleton — loaded once, reused across requests
# ---------------------------------------------------------------------------
_model = None


def _get_model():
    """Lazy-load the Whisper model on first call."""
    global _model
    if _model is not None:
        return _model

    from faster_whisper import WhisperModel  # deferred so boot doesn't block if unused

    model_size = os.getenv("WHISPER_MODEL", "tiny.en")

    # Auto-detect best compute: CUDA float16 when available, CPU int8 otherwise
    try:
        import torch
        if torch.cuda.is_available():
            device, compute_type = "cuda", "float16"
        else:
            device, compute_type = "cpu", "int8"
    except ImportError:
        device, compute_type = "cpu", "int8"

    logger.info(
        f"🎙️  Loading Whisper model '{model_size}' on {device.upper()} ({compute_type})…"
    )
    _model = WhisperModel(model_size, device=device, compute_type=compute_type)
    logger.info("🎙️  Whisper model ready.")
    return _model


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def transcribe_audio(file_path: str) -> str:
    """
    Transcribe an audio file to text using the local Whisper model.

    Accepts any format ffmpeg can decode (wav, webm, ogg, mp3, m4a, …).
    Returns the full transcription as a single string.
    """
    model = _get_model()

    segments, info = model.transcribe(
        file_path,
        beam_size=5,
        language="en",
        vad_filter=True,          # skip silence — faster on sparse audio
        vad_parameters=dict(
            min_silence_duration_ms=500,
        ),
    )

    # Materialise generator and join segment texts
    transcript_parts = []
    for segment in segments:
        transcript_parts.append(segment.text.strip())

    transcript = " ".join(transcript_parts)
    logger.info(
        f"🎙️  Transcribed {info.duration:.1f}s audio → {len(transcript)} chars "
        f"(language={info.language}, prob={info.language_probability:.2f})"
    )
    return transcript
