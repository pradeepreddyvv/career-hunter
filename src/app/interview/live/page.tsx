"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import AppNav from "@/components/AppNav";
import { createListenEngine, type ListenEngine } from "@/lib/listen-engine";

type Persona = "bar_raiser" | "grilling" | "friendly";
type RoundType = "behavioral" | "technical" | "mixed";

interface Message {
  role: "interviewer" | "candidate";
  content: string;
  timestamp: number;
}

interface QueuedQuestion {
  text: string;
  lp?: string;
  category?: string;
}

interface AnswerRecord {
  question: QueuedQuestion;
  answer: string;
}

interface SessionSummary {
  overall_score: number;
  recommendation: string;
  per_question: { question: string; score: number; strengths: string; gaps: string }[];
  leadership_principles_signal: { lp: string; strength: string; evidence: string }[];
  top_strengths: string[];
  top_improvements: string[];
  next_actions: string[];
}

const PERSONA_LABELS: Record<Persona, { label: string; desc: string }> = {
  bar_raiser: { label: "Bar Raiser", desc: "Sharp, LP-focused, probes for specifics" },
  grilling: { label: "Grilling", desc: "Tough, pushes back hard on fluff" },
  friendly: { label: "Friendly", desc: "Warm, nudges gently, builds confidence" },
};

const ROUND_LABELS: Record<RoundType, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  mixed: "Mixed",
};

const INTROS: Record<Persona, string> = {
  bar_raiser:
    "Thanks for making time today. I'm going to ask you a few questions — take your time, and answer with the STAR format when you can. Let's jump in.",
  grilling:
    "Alright, let's get started. I'll be pushing you on specifics today, so be precise. First question.",
  friendly:
    "Hey, good to meet you! Let's walk through a few questions together. Feel free to think out loud.",
};

export default function LiveInterviewPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [company, setCompany] = useState("Amazon");
  const [role, setRole] = useState("SDE Intern");
  const [userName, setUserName] = useState("");
  const [persona, setPersona] = useState<Persona>("bar_raiser");
  const [roundType, setRoundType] = useState<RoundType>("behavioral");
  const [questionCount, setQuestionCount] = useState(5);
  const [autoInterrupt, setAutoInterrupt] = useState(true);

  const [phase, setPhase] = useState<"setup" | "session" | "summary">("setup");
  const [isListening, setIsListening] = useState(false);
  const [engineState, setEngineState] = useState<string>("idle");
  const [rollingText, setRollingText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [textInput, setTextInput] = useState("");
  const [summaryData, setSummaryData] = useState<SessionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const engineRef = useRef<ListenEngine | null>(null);
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const queueRef = useRef<QueuedQuestion[]>([]);
  const qIdxRef = useRef(0);
  const currentQRef = useRef<QueuedQuestion | null>(null);
  const answersRef = useRef<AnswerRecord[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText, rollingText]);

  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      recognitionRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.name) setUserName(d.name); })
      .catch(() => {});
  }, []);

  function speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) { resolve(); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  function startRecognition() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalChunk += event.results[i][0].transcript + " ";
        } else {
          interimChunk += event.results[i][0].transcript;
        }
      }
      engineRef.current?.feed(finalChunk, interimChunk);
    };

    recognition.onerror = () => {};
    recognition.onend = () => {
      if (isListening && engineRef.current?.isRunning()) {
        try { recognition.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopRecognition() {
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
  }

  const addMessage = useCallback((role: "interviewer" | "candidate", content: string) => {
    const msg: Message = { role, content, timestamp: Date.now() };
    setMessages((prev) => [...prev, msg]);
  }, []);

  function buildQuestionPool(): QueuedQuestion[] {
    const behavioral: QueuedQuestion[] = [
      { text: "Tell me about a time you had to make a difficult decision with limited data.", lp: "Bias for Action", category: "behavioral" },
      { text: "Describe a time you disagreed with your manager or team. How did you handle it?", lp: "Have Backbone; Disagree and Commit", category: "behavioral" },
      { text: "Tell me about a time you went above and beyond for a customer or end user.", lp: "Customer Obsession", category: "behavioral" },
      { text: "Describe a project where you simplified a complex process.", lp: "Invent and Simplify", category: "behavioral" },
      { text: "Tell me about a time you took ownership of a problem outside your direct responsibility.", lp: "Ownership", category: "behavioral" },
      { text: "Describe a time you had to deliver results under a tight deadline.", lp: "Deliver Results", category: "behavioral" },
      { text: "Tell me about a time you learned something new to solve a problem.", lp: "Learn and Be Curious", category: "behavioral" },
      { text: "Describe a time you had to earn the trust of a skeptical stakeholder.", lp: "Earn Trust", category: "behavioral" },
    ];

    const technical: QueuedQuestion[] = [
      { text: "Walk me through how you would design a URL shortening service.", category: "technical" },
      { text: "Tell me about a time you optimized a slow system or API. What was your approach?", category: "technical" },
      { text: "How would you design a real-time notification system?", category: "technical" },
      { text: "Describe your experience with database migrations at scale.", category: "technical" },
      { text: "Walk me through how you debug a production issue you've never seen before.", category: "technical" },
      { text: "How would you design an API rate limiter?", category: "technical" },
    ];

    let pool: QueuedQuestion[] = [];
    if (roundType === "behavioral") pool = behavioral;
    else if (roundType === "technical") pool = technical;
    else pool = [...behavioral, ...technical];

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, questionCount);
  }

  async function apiDecide(transcript: string, reason: string): Promise<{ action: string; message: string } | null> {
    const history = messagesRef.current.slice(-10).map((m) => ({
      role: m.role === "interviewer" ? "interviewer" : "candidate",
      text: m.content,
    }));

    try {
      const res = await fetch("/api/interview/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decide",
          transcript,
          reason,
          persona,
          userName: userName || "the candidate",
          currentQuestion: currentQRef.current?.text || "",
          currentLP: currentQRef.current?.lp,
          history,
        }),
      });
      return await res.json();
    } catch {
      return null;
    }
  }

  function initEngine() {
    if (engineRef.current) engineRef.current.stop();

    const engine = createListenEngine({
      silenceMs: 1800,
      wordThreshold: 35,
      autoMode: autoInterrupt,
      onTranscript(rolling, interim) {
        setRollingText(rolling);
        setInterimText(interim);
      },
      async onDecide(transcript, reason) {
        return apiDecide(transcript, reason);
      },
      onStateChange(state, reason) {
        setEngineState(state);
        if (state === "speaking") {
          stopRecognition();
        } else if (state === "listening") {
          startRecognition();
        }
      },
      async onSpeak(message) {
        addMessage("interviewer", message);
        const candidateText = engine.getTranscript();
        if (candidateText) {
          addMessage("candidate", candidateText);
          engine.clearTranscript();
          setRollingText("");
          setInterimText("");
        }
        await speak(message);
      },
    });

    engineRef.current = engine;
    return engine;
  }

  async function startInterview() {
    const queue = buildQuestionPool();
    if (!queue.length) return;

    queueRef.current = queue;
    qIdxRef.current = 0;
    answersRef.current = [];
    setMessages([]);
    setSessionSeconds(0);
    setSummaryData(null);
    setPhase("session");

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setSessionSeconds((s) => s + 1), 1000);

    const intro = INTROS[persona];
    addMessage("interviewer", intro);
    await speak(intro);
    await askNextQuestion();
  }

  async function askNextQuestion() {
    const queue = queueRef.current;
    const idx = qIdxRef.current;
    if (idx >= queue.length) {
      await endSession();
      return;
    }

    const q = queue[idx];
    currentQRef.current = q;
    addMessage("interviewer", q.text);
    await speak(q.text);
    startListening();
  }

  function startListening() {
    const engine = initEngine();
    engine.start();
    setIsListening(true);
    setEngineState("listening");
    startRecognition();
  }

  function stopListening() {
    engineRef.current?.stop();
    stopRecognition();
    setIsListening(false);
    setEngineState("idle");
  }

  async function finishAnswer() {
    const finalText = engineRef.current?.getTranscript() || "";
    stopListening();

    if (finalText) {
      addMessage("candidate", finalText);
    }

    const q = currentQRef.current;
    if (q) {
      answersRef.current.push({ question: q, answer: finalText });
    }

    setRollingText("");
    setInterimText("");
    setStreaming(true);
    setStreamText("");

    try {
      const res = await fetch("/api/interview/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finish_answer",
          answer: finalText,
          persona,
          userName: userName || "the candidate",
          currentQuestion: q?.text || "",
          currentLP: q?.lp,
        }),
      });
      const result = await res.json();
      const msg = result.message || "Thanks, let's move on.";
      addMessage("interviewer", msg);
      await speak(msg);

      if (result.action === "followup") {
        engineRef.current?.clearTranscript();
        startListening();
      } else {
        qIdxRef.current++;
        await askNextQuestion();
      }
    } catch {
      addMessage("interviewer", "Thanks. Let's move on to the next question.");
      qIdxRef.current++;
      await askNextQuestion();
    } finally {
      setStreaming(false);
      setStreamText("");
    }
  }

  function sendText() {
    if (!textInput.trim() || streaming) return;
    const text = textInput.trim();
    setTextInput("");
    addMessage("candidate", text);

    const q = currentQRef.current;
    if (q) {
      answersRef.current.push({ question: q, answer: text });
    }

    (async () => {
      setStreaming(true);
      try {
        const res = await fetch("/api/interview/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "finish_answer",
            answer: text,
            persona,
            userName: userName || "the candidate",
            currentQuestion: q?.text || "",
            currentLP: q?.lp,
          }),
        });
        const result = await res.json();
        const msg = result.message || "Thanks, let's move on.";
        addMessage("interviewer", msg);
        await speak(msg);

        if (result.action === "followup") {
          startListening();
        } else {
          qIdxRef.current++;
          await askNextQuestion();
        }
      } catch {
        qIdxRef.current++;
        await askNextQuestion();
      } finally {
        setStreaming(false);
      }
    })();
  }

  async function endSession() {
    stopListening();
    window.speechSynthesis?.cancel();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    const finalText = engineRef.current?.getTranscript() || "";
    if (finalText && currentQRef.current) {
      const lastQ = currentQRef.current;
      if (!answersRef.current.length || answersRef.current[answersRef.current.length - 1].question !== lastQ) {
        answersRef.current.push({ question: lastQ, answer: finalText });
        addMessage("candidate", finalText);
      }
    }

    setPhase("summary");
    setSummaryLoading(true);

    try {
      const res = await fetch("/api/interview/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "session_summary",
          answers: answersRef.current.map((a) => ({
            question: a.question.text,
            lp: a.question.lp,
            answer: a.answer,
          })),
          persona,
          userName: userName || "the candidate",
          company,
          role,
        }),
      });
      const data = await res.json();
      setSummaryData(data);
    } catch {
      setSummaryData(null);
    } finally {
      setSummaryLoading(false);
    }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  }

  const stateColors: Record<string, string> = {
    listening: "bg-green-500",
    thinking: "bg-yellow-500",
    speaking: "bg-blue-500",
    error: "bg-red-500",
    idle: "bg-gray-500",
  };

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto">
          {phase === "setup" && (
            <div className="text-center py-12">
              <h1 className="text-3xl font-bold mb-2">Live AI Interview</h1>
              <p className="text-gray-400 mb-8">Conversational mock interview with real-time AI follow-ups and silence detection</p>

              <div className="max-w-lg mx-auto space-y-6 text-left">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Company</label>
                    <input value={company} onChange={(e) => setCompany(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Role</label>
                    <input value={role} onChange={(e) => setRole(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Your Name</label>
                  <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Used in interviewer dialogue" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-2">Interview Style</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(PERSONA_LABELS) as [Persona, typeof PERSONA_LABELS.bar_raiser][]).map(([key, val]) => (
                      <button
                        key={key}
                        onClick={() => setPersona(key)}
                        className={`px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                          persona === key ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        <div className="font-medium">{val.label}</div>
                        <div className="text-xs opacity-70 mt-0.5">{val.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-2">Round Type</label>
                    <div className="flex gap-2">
                      {(Object.entries(ROUND_LABELS) as [RoundType, string][]).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setRoundType(key)}
                          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                            roundType === key ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-2">Questions</label>
                    <div className="flex gap-2">
                      {[3, 5, 8].map((n) => (
                        <button
                          key={n}
                          onClick={() => setQuestionCount(n)}
                          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                            questionCount === n ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={autoInterrupt} onChange={(e) => setAutoInterrupt(e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-700 peer-checked:bg-blue-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                  </label>
                  <span className="text-sm text-gray-300">Auto-interrupt (AI responds to silence &amp; direct questions)</span>
                </div>

                <button onClick={startInterview} className="w-full px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition-colors">
                  Start Interview
                </button>
              </div>
            </div>
          )}

          {phase === "session" && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${stateColors[engineState] || stateColors.idle}`} />
                  <div>
                    <h1 className="text-xl font-bold">{company} — {PERSONA_LABELS[persona].label}</h1>
                    <p className="text-gray-400 text-xs">
                      {role} &middot; {ROUND_LABELS[roundType]} &middot;
                      Q{Math.min(qIdxRef.current + 1, queueRef.current.length)}/{queueRef.current.length} &middot;
                      {formatTime(sessionSeconds)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={finishAnswer}
                    disabled={streaming}
                    className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-lg text-xs transition-colors disabled:opacity-40"
                  >
                    Next Question
                  </button>
                  <button
                    onClick={endSession}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs transition-colors"
                  >
                    End Interview
                  </button>
                </div>
              </div>

              {currentQRef.current && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    {currentQRef.current.lp && (
                      <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">{currentQRef.current.lp}</span>
                    )}
                    {currentQRef.current.category && (
                      <span className="text-xs text-gray-500">{currentQRef.current.category}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-200">{currentQRef.current.text}</p>
                </div>
              )}

              <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col" style={{ minHeight: "400px", maxHeight: "60vh" }}>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${
                        msg.role === "interviewer"
                          ? "bg-gray-800 text-gray-200 mr-auto"
                          : "bg-blue-900/30 text-blue-200 ml-auto"
                      }`}
                    >
                      <p className="text-xs text-gray-500 mb-1">
                        {msg.role === "interviewer" ? "Interviewer" : "You"}
                      </p>
                      <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                    </div>
                  ))}

                  {streaming && (
                    <div className="text-sm text-gray-500 animate-pulse px-3">AI is thinking...</div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {(rollingText || interimText) && (
                  <div className="border-t border-gray-800 px-4 py-2 bg-gray-800/30">
                    <p className="text-xs text-gray-500 mb-1">Live transcript</p>
                    <p className="text-sm text-gray-300">
                      {rollingText}
                      {interimText && <span className="text-gray-500 italic"> {interimText}</span>}
                      {isListening && <span className="inline-block w-1.5 h-3 bg-red-400 animate-pulse ml-1" />}
                    </p>
                  </div>
                )}

                <div className="border-t border-gray-800 p-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (isListening) stopListening();
                        else startListening();
                      }}
                      disabled={streaming}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isListening ? "bg-red-600 hover:bg-red-500 animate-pulse" : "bg-gray-700 hover:bg-gray-600"
                      } disabled:opacity-40`}
                    >
                      {isListening ? "Stop Mic" : "Start Mic"}
                    </button>
                    {isListening && (
                      <button
                        onClick={() => engineRef.current?.forceSpeak()}
                        disabled={streaming}
                        className="px-3 py-2 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm transition-colors disabled:opacity-40"
                      >
                        Talk Now
                      </button>
                    )}
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendText()}
                      placeholder="Or type your answer..."
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      disabled={streaming}
                    />
                    <button
                      onClick={sendText}
                      disabled={streaming || !textInput.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {phase === "summary" && (
            <div className="py-8">
              <h1 className="text-2xl font-bold mb-2 text-center">Session Summary</h1>
              <p className="text-gray-400 text-center mb-6">
                {company} &middot; {PERSONA_LABELS[persona].label} &middot; {formatTime(sessionSeconds)}
              </p>

              {summaryLoading && (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-gray-400">Scoring your full session...</p>
                </div>
              )}

              {!summaryLoading && !summaryData && (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-4">No answers were captured for scoring.</p>
                  <button onClick={() => setPhase("setup")} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors">
                    Start Another
                  </button>
                </div>
              )}

              {!summaryLoading && summaryData && (
                <div className="space-y-4">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
                    <div className="text-5xl font-bold text-blue-400 mb-2">{summaryData.overall_score}/100</div>
                    <div className="text-lg text-cyan-400 font-medium">{summaryData.recommendation}</div>
                  </div>

                  {summaryData.per_question?.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <h3 className="text-sm font-semibold mb-3">Per-Question Breakdown</h3>
                      <div className="space-y-2">
                        {summaryData.per_question.map((q, i) => (
                          <div key={i} className="bg-gray-800 rounded-lg p-3">
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-xs font-medium text-gray-200">{q.question}</p>
                              <span className="text-xs text-cyan-400 ml-2 shrink-0">{q.score}/100</span>
                            </div>
                            <p className="text-xs text-green-400">{q.strengths}</p>
                            <p className="text-xs text-yellow-400">{q.gaps}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {summaryData.leadership_principles_signal?.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <h3 className="text-sm font-semibold mb-3">Leadership Principles</h3>
                      <div className="space-y-2">
                        {summaryData.leadership_principles_signal.map((lp, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                              lp.strength === "strong" ? "bg-green-500/20 text-green-400" :
                              lp.strength === "mixed" ? "bg-yellow-500/20 text-yellow-400" :
                              "bg-red-500/20 text-red-400"
                            }`}>{lp.strength}</span>
                            <div>
                              <span className="text-xs font-medium text-gray-200">{lp.lp}</span>
                              <p className="text-xs text-gray-400">{lp.evidence}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {summaryData.top_strengths?.length > 0 && (
                      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <h3 className="text-sm font-semibold mb-2">Strengths</h3>
                        <ul className="space-y-1">
                          {summaryData.top_strengths.map((s, i) => (
                            <li key={i} className="text-xs text-green-400">{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {summaryData.top_improvements?.length > 0 && (
                      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <h3 className="text-sm font-semibold mb-2">Improvements</h3>
                        <ul className="space-y-1">
                          {summaryData.top_improvements.map((s, i) => (
                            <li key={i} className="text-xs text-yellow-400">{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {summaryData.next_actions?.length > 0 && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <h3 className="text-sm font-semibold mb-2">Next Actions</h3>
                      <ul className="space-y-1">
                        {summaryData.next_actions.map((a, i) => (
                          <li key={i} className="text-xs text-gray-300">{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="text-center pt-4">
                    <button onClick={() => setPhase("setup")} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors">
                      Start Another Session
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
