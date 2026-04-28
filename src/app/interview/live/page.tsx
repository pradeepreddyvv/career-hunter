"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import AppNav from "@/components/AppNav";

interface Message {
  role: "interviewer" | "candidate";
  content: string;
  timestamp: number;
}

export default function LiveInterviewPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [company, setCompany] = useState("Amazon");
  const [role, setRole] = useState("SDE Intern");
  const [started, setStarted] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  function createRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    return recognition;
  }

  function startRecording() {
    const recognition = createRecognition();
    if (!recognition) {
      setTranscript("Speech recognition not available in this browser.");
      return;
    }
    recognitionRef.current = recognition;
    let finalTranscript = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript + interim);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
    setIsRecording(true);
    setTranscript("");
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }

  const sendToInterviewer = useCallback(async (candidateText: string) => {
    if (!candidateText.trim()) return;

    const candidateMsg: Message = { role: "candidate", content: candidateText.trim(), timestamp: Date.now() };
    const updatedMessages = [...messages, candidateMsg];
    setMessages(updatedMessages);
    setTranscript("");
    setStreaming(true);
    setStreamText("");

    const controller = new AbortController();
    abortRef.current = controller;

    const historyText = updatedMessages
      .slice(-10)
      .map((m) => `${m.role === "interviewer" ? "Interviewer" : "Candidate"}: ${m.content}`)
      .join("\n");

    try {
      const res = await fetch("/api/interview/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "follow_up",
          answer: candidateText,
          question: updatedMessages.find((m) => m.role === "interviewer")?.content || "Tell me about yourself",
          company,
          context: historyText,
        }),
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");
      const decoder = new TextDecoder();
      let full = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "token" && event.data) {
              full += event.data;
              setStreamText(full);
            } else if (event.type === "done") {
              if (typeof event.data === "string") full = event.data;
              else if (event.data?.followUpQuestion) full = event.data.followUpQuestion;
            }
          } catch { /* skip */ }
        }
      }

      if (full) {
        setMessages((prev) => [...prev, { role: "interviewer", content: full, timestamp: Date.now() }]);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => [...prev, { role: "interviewer", content: "I didn't catch that. Could you try again?", timestamp: Date.now() }]);
      }
    } finally {
      setStreaming(false);
      setStreamText("");
      abortRef.current = null;
    }
  }, [messages, company]);

  function startInterview() {
    setStarted(true);
    const opener: Message = {
      role: "interviewer",
      content: `Hi! I'm your interviewer today for the ${role} position at ${company}. Let's get started. Can you tell me about a time you had to make a difficult technical decision with limited information? Walk me through your thought process.`,
      timestamp: Date.now(),
    };
    setMessages([opener]);
  }

  function submitTranscript() {
    if (transcript.trim()) {
      sendToInterviewer(transcript);
    }
  }

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto">
          {!started ? (
            <div className="text-center py-16">
              <h1 className="text-3xl font-bold mb-4">Live AI Interview</h1>
              <p className="text-gray-400 mb-8">Conversational mock interview with real-time AI responses</p>
              <div className="max-w-sm mx-auto space-y-4 mb-8">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Company</label>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Role</label>
                  <input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <button
                onClick={startInterview}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition-colors"
              >
                Start Interview
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-xl font-bold">Live Interview — {company}</h1>
                  <p className="text-gray-400 text-xs">{role} &middot; {messages.length} messages</p>
                </div>
                <button
                  onClick={() => { setStarted(false); setMessages([]); }}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs transition-colors"
                >
                  End Interview
                </button>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col" style={{ minHeight: "450px", maxHeight: "70vh" }}>
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

                  {streaming && streamText && (
                    <div className="text-sm bg-gray-800 text-gray-200 rounded-lg px-3 py-2 max-w-[85%] mr-auto">
                      <p className="text-xs text-gray-500 mb-1">Interviewer</p>
                      <pre className="whitespace-pre-wrap font-sans">{streamText}</pre>
                      <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse" />
                    </div>
                  )}
                  {streaming && !streamText && (
                    <div className="text-sm text-gray-500 animate-pulse px-3">Thinking...</div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="border-t border-gray-800 p-3 space-y-2">
                  {transcript && (
                    <div className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2">
                      {transcript}
                      {isRecording && <span className="inline-block w-1.5 h-3 bg-red-400 animate-pulse ml-1" />}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={streaming}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isRecording
                          ? "bg-red-600 hover:bg-red-500 animate-pulse"
                          : "bg-gray-700 hover:bg-gray-600"
                      } disabled:opacity-40`}
                    >
                      {isRecording ? "Stop" : "Speak"}
                    </button>
                    <input
                      type="text"
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitTranscript()}
                      placeholder="Type or use voice..."
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      disabled={streaming}
                    />
                    <button
                      onClick={streaming ? () => abortRef.current?.abort() : submitTranscript}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        streaming ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500"
                      }`}
                    >
                      {streaming ? "Stop" : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
