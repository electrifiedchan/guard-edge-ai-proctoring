"use client";

import { useRef, useState, useCallback } from "react";

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

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);
  const hasSpeechRef = useRef(false);
  const stoppedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    setIsListening(false);
    setIsVoiceActive(false);
    setAudioLevel(0);
  }, []);

  const startListening = useCallback(async () => {
    stoppedRef.current = false;
    hasSpeechRef.current = false;
    silenceStartRef.current = 0;
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

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
      if (chunksRef.current.length > 0 && hasSpeechRef.current) {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onSpeechEnd?.(blob);
      }
      chunksRef.current = [];
    };

    recorder.start(1000);
    setIsListening(true);

    const dataArray = new Float32Array(analyser.fftSize);

    const tick = () => {
      if (stoppedRef.current) return;

      analyser.getFloatTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sumSquares += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      setAudioLevel(Math.min(rms * 10, 1));

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
            if (recorder.state === "recording") recorder.stop();
            stream.getTracks().forEach((t) => t.stop());
            if (audioContext.state !== "closed") audioContext.close();
            setIsListening(false);
            setIsVoiceActive(false);
            setAudioLevel(0);
            return;
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [silenceThresholdMs, volumeThreshold, onSpeechEnd, cleanup]);

  const stopListening = useCallback(() => {
    stoppedRef.current = true;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
    }
    setIsListening(false);
    setIsVoiceActive(false);
    setAudioLevel(0);
  }, []);

  return {
    isListening,
    isVoiceActive,
    audioLevel,
    startListening,
    stopListening,
    cleanup,
  };
}
