import threading
import time
import logging

logger = logging.getLogger(__name__)

# Optional imports — speech_recognition + pyttsx3 depend on native libraries
# (PortAudio, espeak, etc.) that may be absent in Docker/headless/CI envs.
# We import defensively so the backend boots even when audio stack is missing.
try:
    import speech_recognition as sr  # type: ignore
except Exception as e:  # pragma: no cover - env-dependent
    sr = None  # type: ignore
    logger.warning(f"⚠️  speech_recognition unavailable, STT disabled: {e}")

try:
    import pyttsx3  # type: ignore
except Exception as e:  # pragma: no cover - env-dependent
    pyttsx3 = None  # type: ignore
    logger.warning(f"⚠️  pyttsx3 unavailable, TTS disabled: {e}")

# Global Voice State
voice_state = {
    "state": "IDLE",  # IDLE, LISTEN, PROCESS, SPEAK
    "transcript": ""
}

# Initialize TTS
engine = None
if pyttsx3 is not None:
    try:
        engine = pyttsx3.init()
        engine.setProperty('rate', 150)
    except Exception as e:
        logger.error(f"TTS Init Error: {e}")
        engine = None

def speak(text):
    if not engine:
        logger.error("TTS engine not available.")
        return

    voice_state["state"] = "SPEAK"
    voice_state["transcript"] = f"AI: {text}"
    logger.info(f"🗣️ TTS: {text}")
    try:
        engine.say(text)
        engine.runAndWait()
    except Exception as e:
        logger.error(f"TTS Error: {e}")
    finally:
        voice_state["state"] = "IDLE"

def voice_loop():
    if sr is None:
        logger.warning("🔇 Voice loop aborted: speech_recognition not installed.")
        return
    recognizer = sr.Recognizer()
    try:
        microphone = sr.Microphone()
        # Adjust for ambient noise
        with microphone as source:
            recognizer.adjust_for_ambient_noise(source)
    except Exception as e:
        logger.error(f"Failed to initialize microphone: {e}")
        return

    logger.info("🎤 Voice Engine background loop started.")
    while True:
        try:
            with microphone as source:
                voice_state["state"] = "LISTEN"
                # Listen for audio (short timeout to keep loop responsive)
                audio = recognizer.listen(source, timeout=2, phrase_time_limit=10)
                
            voice_state["state"] = "PROCESS"
            transcript = recognizer.recognize_google(audio)
            voice_state["transcript"] = f"CANDIDATE: {transcript}"
            logger.info(f"🎙️ STT: {transcript}")
            
            # Brief pause after processing to let frontend read state
            time.sleep(2)
            voice_state["state"] = "IDLE"
            
        except sr.WaitTimeoutError:
            # Expected if no speech is detected within timeout
            pass
        except sr.UnknownValueError:
            # Speech was unintelligible
            voice_state["state"] = "IDLE"
        except sr.RequestError as e:
            logger.warning(f"🌐 STT Network Error (ignored, retrying): {e}")
            voice_state["state"] = "IDLE"
            time.sleep(2)
        except Exception as e:
            logger.error(f"Voice loop error: {e}")
            voice_state["state"] = "IDLE"
            time.sleep(1)

def start_voice_loop():
    if sr is None and engine is None:
        logger.info("🔇 Voice engine inactive (no audio stack present).")
        return
    thread = threading.Thread(target=voice_loop, daemon=True)
    thread.start()
