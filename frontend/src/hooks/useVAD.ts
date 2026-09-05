"use client";

import { useRef, useState, useCallback } from "react";

/**
 * A WebM container with only its header and no audio cluster still weighs a few
 * hundred bytes, so `size > 0` does not mean "there is speech in here". ffmpeg
 * either rejects those outright or Whisper transcribes them as "". Dropping
 * them here saves a round trip and a 500 in the log that looks like a bug.
 */
const MIN_BLOB_BYTES = 2048;

interface UseVADOptions {
  silenceThresholdMs?: number;
  volumeThreshold?: number;
  onSpeechEnd?: (blob: Blob) => void;
}

export function useVAD({
  silenceThresholdMs = 2500,
  volumeThreshold = 0.01,
  onSpeechEnd,
}: UseVADOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  /**
   * Same RMS as `audioLevel`, but written every animation frame instead of
   * through setState. The waveform samples this per frame: routing 60 updates
   * a second through React state meant re-rendering the whole sentry page
   * (camera panel, transcript, chat) on every frame, so React throttled the
   * commits and the ribbons lagged behind the voice. Consumers that only need
   * a coarse value can keep using the state copy below.
   */
  const audioLevelRef = useRef(0);


  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);
  const hasSpeechRef = useRef(false);
  const stoppedRef = useRef(false);
  /**
   * Loudest level seen since the mic opened. Only used for diagnostics: a peak
   * of ~0 while listening means the analyser is being fed silence (suspended
   * context, muted or wrong input device), which is otherwise indistinguishable
   * from a candidate who said nothing at all.
   */
  const peakLevelRef = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Release the mic and the AudioContext.
   *
   * Only safe to call directly when the recorder is NOT running — while it is,
   * `onstop` owns this teardown, because cutting the tracks before the encoder
   * flushes produces an unplayable WebM. Both exits below route through here.
   */
  const releaseAudio = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    stoppedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();   // onstop releases the mic
    } else {
      releaseAudio();
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    setIsListening(false);
    setIsVoiceActive(false);
    audioLevelRef.current = 0;
    setAudioLevel(0);
  }, [releaseAudio]);

  const startListening = useCallback(async () => {
    stoppedRef.current = false;
    hasSpeechRef.current = false;
    silenceStartRef.current = 0;
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    // The mic only opens after the interviewer has finished speaking — several
    // awaits removed from the click that started the run — and a context created
    // that far from a user gesture can start life `suspended`. MediaRecorder
    // records either way, but a suspended context feeds the analyser nothing but
    // zeros: RMS never crosses the threshold, hasSpeechRef stays false, the
    // silence timer never arms, and the mic sits open forever on "Waiting for
    // voice" while every word the candidate says is dropped on the floor.
    // Resuming is a no-op when the context is already running.
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyserRef.current = analyser;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      // Tracks and AudioContext are torn down HERE, not at the call site.
      //
      // recorder.stop() is asynchronous: it fires a final ondataavailable and
      // then onstop. Killing the MediaStream tracks on the line after stop()
      // cut the source out from under the encoder, so the last WebM cluster
      // never got its header and ffmpeg rejected the whole blob with
      // "Invalid data found when processing input" (AVERROR_INVALIDDATA).
      // That was the intermittent 500 on /voice/transcribe -- intermittent
      // because it depended on whether the flush won the race.
      releaseAudio();

      if (chunksRef.current.length > 0 && hasSpeechRef.current) {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size >= MIN_BLOB_BYTES) {
          onSpeechEnd?.(blob);
        } else {
          console.warn(`[VAD] Discarding ${blob.size}B clip — too short to transcribe.`);
        }
      }
      chunksRef.current = [];
    };

    recorder.start(1000);
    setIsListening(true);

    const track = stream.getAudioTracks()[0];
    console.log(
      `[VAD] Listening — context=${audioContext.state} device="${track?.label ?? "unknown"}" ` +
      `muted=${track?.muted} enabled=${track?.enabled}`
    );

    // A dead analyser looks exactly like a silent candidate, and the mic stays
    // open indefinitely either way because the silence timer only arms once
    // speech has been heard. Say it out loud instead of waiting forever.
    peakLevelRef.current = 0;
    watchdogRef.current = setTimeout(() => {
      if (stoppedRef.current || hasSpeechRef.current) return;
      console.warn(
        `[VAD] No speech detected after 6s — context=${audioContextRef.current?.state}, ` +
        `peak level=${peakLevelRef.current.toFixed(4)}, threshold=${volumeThreshold}. ` +
        `A peak near 0 means the microphone is delivering silence, not that you were quiet.`
      );
    }, 6000);

    const dataArray = new Float32Array(analyser.fftSize);

    const tick = () => {
      if (stoppedRef.current) return;

      analyser.getFloatTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sumSquares += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const level = Math.min(rms * 10, 1);
      audioLevelRef.current = level;
      setAudioLevel(level);
      if (level > peakLevelRef.current) peakLevelRef.current = level;

      if (rms > volumeThreshold) {
        hasSpeechRef.current = true;
        silenceStartRef.current = 0;
        setIsVoiceActive(true);
      } else {
        setIsVoiceActive(false);
        if (hasSpeechRef.current) {
          if (silenceStartRef.current === 0) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current >= silenceThresholdMs) {
            stoppedRef.current = true;
            // Only stop the recorder. onstop tears down the stream and the
            // AudioContext once the final cluster is flushed.
            if (recorder.state === "recording") recorder.stop();
            setIsListening(false);
            setIsVoiceActive(false);
            audioLevelRef.current = 0;
            setAudioLevel(0);
            return;
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [silenceThresholdMs, volumeThreshold, onSpeechEnd, releaseAudio]);

  const stopListening = useCallback(() => {
    stoppedRef.current = true;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();   // onstop releases the mic
    } else {
      releaseAudio();
    }
    setIsListening(false);
    setIsVoiceActive(false);
    audioLevelRef.current = 0;
    setAudioLevel(0);
  }, [releaseAudio]);

  return {
    isListening,
    isVoiceActive,
    audioLevel,
    audioLevelRef,
    startListening,
    stopListening,
    cleanup,
  };
}
