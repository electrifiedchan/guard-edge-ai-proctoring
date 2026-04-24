import threading
import time
import speech_recognition as sr
import pyttsx3
import logging

logger = logging.getLogger(__name__)

# Global Voice State
voice_state = {
    "state": "IDLE",  # IDLE, LISTEN, PROCESS, SPEAK
    "transcript": ""
}

# Initialize TTS
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
    thread = threading.Thread(target=voice_loop, daemon=True)
    thread.start()
