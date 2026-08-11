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

    def _run(vad_filter: bool):
        kwargs = {"beam_size": 5, "language": "en", "vad_filter": vad_filter}
        if vad_filter:
            kwargs["vad_parameters"] = dict(min_silence_duration_ms=500)
        segments, info = model.transcribe(file_path, **kwargs)
        # `segments` is a generator: nothing is decoded until it is consumed.
        text = " ".join(s.text.strip() for s in segments).strip()
        return text, info

    transcript, info = _run(vad_filter=True)

    # The VAD is tuned for sparse audio, and on a quiet mic or a soft speaker it
    # classifies the entire clip as silence — the request then succeeds with an
    # empty transcript, which the caller cannot tell apart from a candidate who
    # said nothing. Whisper on the raw waveform is slower but makes no such
    # call, so it earns one retry before we report silence.
    if not transcript:
        logger.warning(
            f"🎙️  VAD found no speech in {info.duration:.1f}s — retrying unfiltered."
        )
        transcript, info = _run(vad_filter=False)

    logger.info(
        f"🎙️  Transcribed {info.duration:.1f}s audio → {len(transcript)} chars "
        f"(language={info.language}, prob={info.language_probability:.2f})"
    )
    return transcript
