export interface SpeechConfig {
  speechmaticsKey?: string;
  language?: string;
  sampleRate?: number;
}

export function createMediaRecorder(
  stream: MediaStream,
  onDataAvailable: (data: Blob) => void,
  onStop: () => void
): MediaRecorder {
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) onDataAvailable(e.data);
  };
  recorder.onstop = onStop;
  return recorder;
}

export function createSpeechmaticsWebSocket(
  tempKey: string,
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (error: string) => void,
  language = "en"
): WebSocket {
  const ws = new WebSocket(
    `wss://eu2.rt.speechmatics.com/v2/${language}`
  );

  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        message: "StartRecognition",
        transcription_config: {
          language,
          enable_partials: true,
          max_delay: 2,
          operating_point: "enhanced",
        },
        audio_format: {
          type: "file",
        },
        auth_token: tempKey,
      })
    );
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.message === "AddTranscript") {
      const text = msg.results
        .map((r: { alternatives: { content: string }[] }) => r.alternatives[0]?.content || "")
        .join(" ");
      onTranscript(text, true);
    } else if (msg.message === "AddPartialTranscript") {
      const text = msg.results
        .map((r: { alternatives: { content: string }[] }) => r.alternatives[0]?.content || "")
        .join(" ");
      onTranscript(text, false);
    } else if (msg.message === "Error") {
      onError(msg.reason || "Speechmatics error");
    }
  };

  ws.onerror = () => onError("WebSocket connection failed");

  return ws;
}

export function startWebSpeechRecognition(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (error: string) => void,
  language = "en-US"
): { stop: () => void } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionCtor) {
    onError("Web Speech API not supported in this browser");
    return null;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = language;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      onTranscript(result[0].transcript, result.isFinal);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onerror = (event: any) => {
    if (event.error !== "no-speech") {
      onError(`Speech recognition error: ${event.error}`);
    }
  };

  recognition.start();
  return { stop: () => recognition.stop() };
}

export async function speakText(
  text: string,
  options?: { rate?: number; pitch?: number; voice?: string }
): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options?.rate ?? 1;
    utterance.pitch = options?.pitch ?? 1;

    if (options?.voice) {
      const voices = speechSynthesis.getVoices();
      const match = voices.find((v) => v.name.includes(options.voice!));
      if (match) utterance.voice = match;
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speechSynthesis.speak(utterance);
  });
}
