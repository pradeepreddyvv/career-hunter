"use client";

export interface ListenEngineConfig {
  silenceMs?: number;
  wordThreshold?: number;
  heartbeatMs?: number | null;
  autoMode?: boolean;
  cooldownMs?: number;
  onTranscript?: (rolling: string, interim: string) => void;
  onDecide: (transcript: string, reason: string) => Promise<{ action: string; message: string } | null>;
  onStateChange?: (state: "listening" | "thinking" | "speaking" | "error", reason: string) => void;
  onSpeak?: (message: string) => Promise<void>;
}

export interface ListenEngine {
  feed: (finalText: string, interimText?: string) => void;
  forceSpeak: () => void;
  start: () => void;
  stop: () => void;
  setAuto: (val: boolean) => void;
  getTranscript: () => string;
  clearTranscript: () => void;
  isSpeaking: () => boolean;
  isRunning: () => boolean;
}

export function createListenEngine(config: ListenEngineConfig): ListenEngine {
  const silenceMs = config.silenceMs ?? 1300;
  const wordThreshold = config.wordThreshold ?? 22;
  const cooldownMs = config.cooldownMs ?? 3000;

  let rolling = "";
  let interim = "";
  let lastCheckText = "";
  let lastSpokeAt = 0;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let longStretchTimer: ReturnType<typeof setTimeout> | null = null;
  let directQTimer: ReturnType<typeof setTimeout> | null = null;
  let checkInProgress = false;
  let speaking = false;
  let running = false;
  let autoMode = config.autoMode !== false;

  function onTick() {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (!autoMode) return;

    silenceTimer = setTimeout(() => maybeSpeak("pause"), silenceMs);

    const cur = rolling.trim();
    const prevWords = lastCheckText ? lastCheckText.split(/\s+/).length : 0;
    const curWords = cur ? cur.split(/\s+/).length : 0;

    if (curWords - prevWords >= wordThreshold) {
      if (longStretchTimer) clearTimeout(longStretchTimer);
      longStretchTimer = setTimeout(() => maybeSpeak("long_stretch"), 600);
    }

    const tail = rolling.trim().slice(-220);
    if (
      /\?\s*$/.test(rolling.trim()) ||
      /\b(can you|could you|what do you mean|i have a question|can i assume|is it okay|should i|am i allowed|is it correct|does that make sense|am i on the right track|am i missing|do i need to|help me|i'm stuck|not sure|confused)\b/i.test(tail)
    ) {
      if (directQTimer) clearTimeout(directQTimer);
      directQTimer = setTimeout(() => maybeSpeak("direct_question"), 800);
    }
  }

  async function maybeSpeak(reason: string) {
    if (checkInProgress || speaking || !running) return;

    const isForced = reason === "manual";
    if (!autoMode && !isForced) return;

    const current = rolling.trim();
    if (!current && reason !== "heartbeat" && reason !== "manual") return;
    if (current && current === lastCheckText && !isForced) return;
    if (!isForced && Date.now() - lastSpokeAt < cooldownMs) return;

    checkInProgress = true;
    lastCheckText = current;
    config.onStateChange?.("thinking", reason);

    try {
      const result = await config.onDecide(current || "(silence so far)", reason);

      let action = result?.action || "silent";
      let msg = result?.message?.trim() || "";

      if (isForced && (!msg || action === "silent")) {
        action = "interrupt";
        msg = "Walk me through where you are right now and what you're thinking.";
      }

      if (action !== "silent" && msg) {
        speaking = true;
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
        config.onStateChange?.("speaking", reason);

        if (config.onSpeak) {
          await config.onSpeak(msg);
        }

        speaking = false;
        lastCheckText = rolling.trim();
        lastSpokeAt = Date.now();

        if (running) {
          config.onStateChange?.("listening", reason);
        }
      } else {
        config.onStateChange?.("listening", reason);
      }
    } catch (e) {
      console.warn("[ListenEngine] error:", e);
      config.onStateChange?.("error", reason);
    } finally {
      checkInProgress = false;
    }
  }

  const engine: ListenEngine = {
    feed(finalText: string, interimText?: string) {
      if (speaking) return;
      if (finalText) rolling += finalText;
      interim = interimText || "";
      lastSpokeAt = Date.now();
      config.onTranscript?.(rolling, interim);
      onTick();
    },

    forceSpeak() {
      if (speaking || checkInProgress || !running) return;
      maybeSpeak("manual");
    },

    start() {
      rolling = "";
      interim = "";
      lastCheckText = "";
      lastSpokeAt = Date.now();
      running = true;
      if (config.heartbeatMs) {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (!running || speaking || checkInProgress || !autoMode) return;
          if (Date.now() - lastSpokeAt > config.heartbeatMs!) maybeSpeak("heartbeat");
        }, 4000);
      }
    },

    stop() {
      running = false;
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      if (longStretchTimer) { clearTimeout(longStretchTimer); longStretchTimer = null; }
      if (directQTimer) { clearTimeout(directQTimer); directQTimer = null; }
    },

    setAuto(val: boolean) { autoMode = val; },
    getTranscript() { return (rolling + " " + interim).trim(); },
    clearTranscript() {
      rolling = "";
      interim = "";
      lastCheckText = "";
      config.onTranscript?.("", "");
    },
    isSpeaking() { return speaking; },
    isRunning() { return running; },
  };

  return engine;
}
