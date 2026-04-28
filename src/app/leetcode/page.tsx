"use client";

import { useState, useRef, useEffect } from "react";
import AppNav from "@/components/AppNav";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const PERSONAS = [
  { id: "interviewer", label: "Interviewer", desc: "Guides like a real interview" },
  { id: "teacher", label: "Teacher", desc: "Explains concepts clearly" },
  { id: "neetcode", label: "NeetCode", desc: "Pattern-based solutions" },
] as const;

export default function LeetCodePage() {
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState("");
  const [message, setMessage] = useState("");
  const [persona, setPersona] = useState<string>("interviewer");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, streamText]);

  async function send() {
    if (!message.trim() || streaming) return;
    const userMsg = message.trim();
    setMessage("");
    setChat((prev) => [...prev, { role: "user", content: userMsg }]);
    setStreaming(true);
    setStreamText("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/leetcode/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, problem, message: userMsg, persona, history: chat }),
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
              full = event.data || full;
            }
          } catch { /* skip malformed */ }
        }
      }

      setChat((prev) => [...prev, { role: "assistant", content: full }]);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setChat((prev) => [...prev, { role: "assistant", content: "Error: failed to get response. Check your AI provider config." }]);
      }
    } finally {
      setStreaming(false);
      setStreamText("");
      abortRef.current = null;
    }
  }

  async function saveSnapshot() {
    try {
      await fetch("/api/leetcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, problem, chat }),
      });
    } catch { /* ignore */ }
  }

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-1">LeetCode Companion</h1>
              <p className="text-gray-400 text-sm">Paste a problem and your code, then chat with an AI coach</p>
            </div>
            <button
              onClick={saveSnapshot}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs transition-colors"
            >
              Save Snapshot
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Code + Problem */}
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <label className="text-xs text-gray-400 block mb-2">Problem Description</label>
                <textarea
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  placeholder="Paste the LeetCode problem statement here..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm min-h-[120px] focus:border-blue-500 focus:outline-none resize-none font-mono"
                />
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <label className="text-xs text-gray-400 block mb-2">Your Code</label>
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste your solution code here..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm min-h-[250px] focus:border-blue-500 focus:outline-none resize-none font-mono"
                />
              </div>
            </div>

            {/* Right: Chat */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col" style={{ minHeight: "500px" }}>
              {/* Persona Tabs */}
              <div className="flex border-b border-gray-800 p-2 gap-1">
                {PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPersona(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      persona === p.id
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-gray-200"
                    }`}
                    title={p.desc}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chat.length === 0 && !streaming && (
                  <div className="text-center text-gray-500 text-sm py-8">
                    <p>Paste a problem and code on the left, then ask a question.</p>
                    <p className="text-xs mt-2 text-gray-600">
                      Try: &quot;What pattern does this problem use?&quot; or &quot;Can you review my approach?&quot;
                    </p>
                  </div>
                )}

                {chat.map((msg, i) => (
                  <div
                    key={i}
                    className={`text-sm ${
                      msg.role === "user"
                        ? "text-blue-300 bg-blue-900/20 rounded-lg px-3 py-2"
                        : "text-gray-300 leading-relaxed"
                    }`}
                  >
                    <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                  </div>
                ))}

                {streaming && streamText && (
                  <div className="text-sm text-gray-300 leading-relaxed">
                    <pre className="whitespace-pre-wrap font-sans">{streamText}</pre>
                    <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5" />
                  </div>
                )}

                {streaming && !streamText && (
                  <div className="text-sm text-gray-500 animate-pulse">Thinking...</div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-gray-800 p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                    placeholder="Ask about the problem, your approach, or code..."
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    disabled={streaming}
                  />
                  <button
                    onClick={streaming ? () => abortRef.current?.abort() : send}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      streaming
                        ? "bg-red-600 hover:bg-red-500"
                        : "bg-blue-600 hover:bg-blue-500"
                    }`}
                  >
                    {streaming ? "Stop" : "Send"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
