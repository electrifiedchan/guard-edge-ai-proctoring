"""
Ollama model recommendations for GUARD, scoped to JSON-reliability and VRAM.

Why this file
-------------
GUARD's `generate_questions` parses the LLM reply as JSON. A model that produces
valid conversational output but fails to hold structure is useless here, so
these picks are filtered by the Structured Output Benchmark results rather than
MMLU or general reasoning scores.

Research sources (January 2026):
- https://arxiv.org/html/2605.02363v1 — JSON parse rates and schema compliance
- https://localaimaster.com/blog/small-language-models-guide-2026 — Ollama tags
- https://whatllm.org/best-ollama-models — VRAM requirements

GUARD's VRAM footprint
-----------------------
The backend's device selection lives at edge_main.py:103 and voice_engine.py:33.
Both resolve `"cuda" if torch.cuda.is_available() else "cpu"`. On a machine with
torch built for CUDA (e.g. torch 2.5.1+cu124), YOLOv8s + faster-whisper tiny.en
hold ~1.2–1.8 GB depending on the card. On CPU-only torch (2.11.0+cpu), they
hold zero — the entire card is free for the language model.

Check your own reserve: nvidia-smi before and after starting a session. That
delta is the VRAM_RESERVE_GB figure below. Do not guess it.

Model selection
---------------
All sizes are Ollama Q4_K_M defaults unless noted. Parameter count alone does
not predict JSON reliability — Llama 3.2 3B achieves only 48–57% parse rate,
while Gemma 3 4B hits 100% parse / 87% schema compliance. Prefer the model that
fits your remaining VRAM AND holds the format over one that scores higher on a
reasoning benchmark.

Quantization note: models under 7B lose the most at Q4. If VRAM allows, prefer
Q8 over a smaller model at Q4 — the SmolLM2 1.7B Q4→Q8 jump went from 26.1% to
56.5% parse rate in the benchmark, a 2.2x improvement.
"""

# Measured on this machine during a live session with torch+CUDA. Set to 0.0
# when torch is CPU-only (torch.__version__ ends in "+cpu"). Update this after
# any change to detection or transcription that affects GPU load.
VRAM_RESERVE_GB = 0.0

# Curated list: JSON-reliable models from 2B to 9B, with real Ollama tags and
# measured sizes. NOT a web scrape. Updated by hand when there's a reason.
#
# Fields:
#   tag         exact Ollama pull command argument
#   size_gb     download size (Q4_K_M unless noted)
#   vram_gb     VRAM needed to run (slightly higher than download for context)
#   params      parameter count for reference
#   why         one line on why it's here, not a different model
#   avoid       pitfall worth calling out, or None
#   recommended False keeps an entry in the table as a documented warning
#               without ever offering it. llama3.2:3b is here for exactly that:
#               it is the obvious pick by size and the wrong one by parse rate,
#               so recording why is more useful than omitting it.
#
MODELS = [
    {
        "tag": "qwen2.5:3b",
        "size_gb": 1.93,
        "vram_gb": 2.2,
        "params": "3.1B",
        "why": "Current default. Reliable JSON format, tested in production.",
        "recommended": True,
        "avoid": None,
    },
    {
        "tag": "phi4-mini",
        "size_gb": 2.2,
        "vram_gb": 2.5,
        "params": "3.8B",
        "why": "Best reasoning per GB. Strong math and logic.",
        "recommended": True,
        "avoid": None,
    },
    {
        "tag": "gemma3:4b",
        "size_gb": 3.0,
        "vram_gb": 3.5,
        "params": "4B",
        "why": "Best JSON reliability: 100% parse rate, 87% schema compliance.",
        "recommended": True,
        "avoid": None,
    },
    {
        "tag": "qwen3.5:4b",
        "size_gb": 3.4,
        "vram_gb": 3.8,
        "params": "4B",
        "why": "Multimodal (text + image input), 256K context.",
        "recommended": True,
        "avoid": "Tight on 4 GB cards — verify free VRAM first.",
    },
    {
        "tag": "gemma4:e4b",
        "size_gb": 9.6,
        "vram_gb": 5.5,
        "params": "~4.5B effective",
        "why": "Native function calling, built for edge devices.",
        "recommended": True,
        "avoid": "Download is 9.6 GB (high-precision default), but runs in ~5.5 GB VRAM at 4-bit.",
    },
    {
        "tag": "qwen3.5:9b",
        "size_gb": 6.6,
        "vram_gb": 7.0,
        "params": "9B",
        "why": "Newest sub-10B Qwen, multimodal. Needs 8 GB+ card.",
        "recommended": True,
        "avoid": "Will not fit a 4 GB card.",
    },
    {
        "tag": "llama3.2:3b",
        "size_gb": 2.2,
        "vram_gb": 2.5,
        "params": "3B",
        "why": None,
        "recommended": False,
        "avoid": "Only 48–57% JSON parse rate in benchmarks. Fast, but unreliable for structured output.",
    },
]


def total_vram_gb() -> float | None:
    """Total VRAM on the primary GPU, or None when there is no usable card.

    Tries torch first because the backend already imports it, then nvidia-smi,
    which answers even when torch is a CPU-only build — the case on this
    machine (torch 2.11.0+cpu against a real RTX 3050). Reporting "no GPU"
    there would be wrong: the card exists and Ollama can use it, it is only
    *torch* that cannot.
    """
    try:
        import torch

        if torch.cuda.is_available():
            return torch.cuda.get_device_properties(0).total_memory / 1e9
    except Exception:
        pass

    import shutil
    import subprocess

    smi = shutil.which("nvidia-smi")
    if not smi:
        return None
    try:
        out = subprocess.run(
            [smi, "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=5.0,
        )
        if out.returncode != 0 or not out.stdout.strip():
            return None
        # First line only: on a multi-GPU box Ollama uses one card by default.
        return float(out.stdout.strip().splitlines()[0]) / 1024.0
    except (subprocess.SubprocessError, ValueError, OSError):
        return None


def report() -> dict:
    """The whole picker payload: the card, the arithmetic, and the shortlist.

    Returns `vram_gb: None` when no GPU was found, which is not an error — a
    CPU-only machine runs Ollama fine, just slowly, so the UI shows the models
    without the fits/does-not-fit split rather than an empty list.
    """
    total = total_vram_gb()
    installed = installed_models()
    usable = None if total is None else round(total - VRAM_RESERVE_GB, 2)

    return {
        "vram_gb": None if total is None else round(total, 2),
        "reserve_gb": VRAM_RESERVE_GB,
        "usable_gb": usable,
        "installed": sorted(installed),
        # Every recommended model, each carrying whether it fits and whether it
        # is already here. The UI needs the ones that do NOT fit as much as the
        # ones that do — "why isn't the 9B listed" is a real question.
        "models": [
            {
                **{k: v for k, v in m.items() if k != "recommended"},
                "installed": m["tag"] in installed,
                "fits": True if usable is None else m["vram_gb"] <= usable,
            }
            for m in MODELS
            if m["recommended"]
        ],
    }


def suggest_models(card_gb: float, installed: set[str] | None = None) -> list[dict]:
    """Models that fit `card_gb` once GUARD's reserve is subtracted.

    Args:
        card_gb: Total VRAM on the card, from torch or nvidia-smi.
        installed: Tags already on disk. Defaults to probing Ollama.

    Returns:
        Fitting recommended models, each with an added `installed` flag. Entries
        carrying `avoid` are excluded entirely — this is a suggestion list, and
        a model we would warn against is one we should not be suggesting.
    """
    if installed is None:
        installed = installed_models()
    available = card_gb - VRAM_RESERVE_GB
    # Copy each dict rather than annotating in place: MODELS is module state and
    # mutating it would leak one caller's `installed` flags into the next call.
    return [
        {**m, "installed": m["tag"] in installed}
        for m in MODELS
        if m["vram_gb"] <= available and m["recommended"]
    ]


def installed_models() -> set[str]:
    """Tags Ollama already has on disk, via its own HTTP API.

    Uses /api/tags rather than shelling out to `ollama list`: the daemon is
    already the thing we probe for reachability, and parsing CLI table output
    breaks when they change the column widths. Returns an empty set when the
    daemon is not answering — the caller renders "nothing installed", which is
    indistinguishable from the truth in that case.
    """
    import json
    import urllib.error
    import urllib.request

    from core_memory.llm_config import ollama_base_url

    # ollama_base_url() ends in /v1 for the OpenAI-compatible surface; /api/tags
    # sits beside it on the root, so trim the suffix rather than rebuilding the
    # host from OLLAMA_HOST a second time.
    root = ollama_base_url().removesuffix("/v1")
    try:
        with urllib.request.urlopen(f"{root}/api/tags", timeout=2.0) as res:
            data = json.load(res)
    except (urllib.error.URLError, OSError, json.JSONDecodeError):
        return set()
    return {m["name"] for m in data.get("models", []) if "name" in m}
