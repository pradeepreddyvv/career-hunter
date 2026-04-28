"use client";

import { useState, useRef, useCallback } from "react";

type RecordingState = "idle" | "recording" | "paused";

export function useRecording() {
  const [state, setState] = useState<RecordingState>("idle");
  const [transcript, setTranscript] = useState("");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [duration, setDuration] = useState(0);
  const [usingSpeechmatics, setUsingSpeechmatics] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = mediaStream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(mediaStream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            e.data.arrayBuffer().then((buf) => wsRef.current?.send(buf));
          }
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);

      let sttStarted = false;
      try {
        const keyRes = await fetch("/api/interview/speechmatics-key");
        const keyData = await keyRes.json();

        if (keyData.key) {
          setUsingSpeechmatics(true);
          const ws = new WebSocket("wss://eu2.rt.speechmatics.com/v2/en");
          wsRef.current = ws;

          ws.onopen = () => {
            ws.send(JSON.stringify({
              message: "StartRecognition",
              transcription_config: {
                language: "en",
                enable_partials: true,
                max_delay: 2,
                operating_point: "enhanced",
              },
              audio_format: { type: "file" },
              auth_token: keyData.key,
            }));
          };

          ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.message === "AddTranscript") {
              const text = msg.results
                .map((r: { alternatives: { content: string }[] }) => r.alternatives[0]?.content || "")
                .join(" ");
              if (text.trim()) {
                setTranscript((prev) => (prev ? prev + " " + text : text));
                setPartialTranscript("");
              }
            } else if (msg.message === "AddPartialTranscript") {
              const text = msg.results
                .map((r: { alternatives: { content: string }[] }) => r.alternatives[0]?.content || "")
                .join(" ");
              setPartialTranscript(text);
            }
          };

          ws.onerror = () => {
            setUsingSpeechmatics(false);
            startWebSpeechFallback();
          };

          sttStarted = true;
        }
      } catch {
        // Speechmatics unavailable, fall through to Web Speech
      }

      if (!sttStarted) {
        startWebSpeechFallback();
      }

      startTimer();
      setState("recording");
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  }, [startTimer]);

  const startWebSpeechFallback = useCallback(() => {
    setUsingSpeechmatics(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          setTranscript((prev: string) => (prev ? prev + " " + result[0].transcript : result[0].transcript));
          setPartialTranscript("");
        } else {
          setPartialTranscript(result[0].transcript);
        }
      }
    };

    recognition.start();
    speechRecRef.current = { stop: () => recognition.stop() };
  }, []);

  const stop = useCallback((): { audioBlob: Blob | null; finalTranscript: string; durationSec: number } => {
    stopTimer();

    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ message: "EndOfStream" }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    speechRecRef.current?.stop();
    speechRecRef.current = null;

    const audioBlob =
      chunksRef.current.length > 0
        ? new Blob(chunksRef.current, { type: "audio/webm" })
        : null;

    const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    setState("idle");

    let finalTranscript = "";
    setTranscript((prev) => {
      finalTranscript = prev;
      return prev;
    });

    return { audioBlob, finalTranscript, durationSec: finalDuration };
  }, [stopTimer]);

  const reset = useCallback(() => {
    setTranscript("");
    setPartialTranscript("");
    setDuration(0);
  }, []);

  return {
    state,
    transcript,
    partialTranscript,
    duration,
    usingSpeechmatics,
    start,
    stop,
    reset,
    setTranscript,
  };
}
