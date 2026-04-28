"use client";

import type { AIState, SessionSummary as SessionSummaryType } from "@/types/interview";

interface Props {
  summary: SessionSummaryType | null;
  state: AIState;
  streamTokens: string;
  error: string | null;
  onNewSession: () => void;
  onViewHistory: () => void;
}

export default function SessionSummaryCard({
  summary,
  state,
  streamTokens,
  error,
  onNewSession,
  onViewHistory,
}: Props) {
  if (state === "thinking" || state === "streaming") {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-sm text-gray-400">
            {state === "thinking" ? "Generating session summary..." : "Analyzing patterns..."}
          </span>
        </div>
        {state === "streaming" && streamTokens && (
          <pre className="text-xs text-gray-400 whitespace-pre-wrap overflow-auto max-h-40">
            {streamTokens}
          </pre>
        )}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="bg-gray-900 border border-red-800/50 rounded-xl p-6">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!summary) return null;

  const signalColor: Record<string, string> = {
    "Strong Hire": "text-green-400",
    "Hire": "text-green-300",
    "Lean Hire": "text-yellow-400",
    "Lean No Hire": "text-orange-400",
    "No Hire": "text-red-400",
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold mb-2">Session Complete</h2>
        <div className="flex items-center justify-center gap-6">
          <div>
            <div className="text-3xl font-bold">{summary.sessionScore}</div>
            <div className="text-xs text-gray-500">Score</div>
          </div>
          <div>
            <div className="text-3xl font-bold">{summary.readiness}%</div>
            <div className="text-xs text-gray-500">Readiness</div>
          </div>
          <div>
            <div className={`text-lg font-bold ${signalColor[summary.hiringSignal] || "text-gray-400"}`}>
              {summary.hiringSignal}
            </div>
            <div className="text-xs text-gray-500">Signal</div>
          </div>
        </div>
      </div>

      {summary.perQuestion.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">Per Question</h3>
          <div className="space-y-1.5">
            {summary.perQuestion.map((q, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[10px] w-28 truncate">
                  {q.lp}
                </span>
                <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full"
                    style={{ width: `${q.score}%` }}
                  />
                </div>
                <span className="text-gray-500 w-8 text-right">{q.score}</span>
                <span className="text-gray-400 flex-1 truncate">{q.oneLiner}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-medium text-green-400 mb-1">Strengths</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            {summary.strengths.map((s, i) => (
              <li key={i}>+ {s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-medium text-yellow-400 mb-1">Weaknesses</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            {summary.weaknesses.map((s, i) => (
              <li key={i}>- {s}</li>
            ))}
          </ul>
        </div>
      </div>

      {summary.priorities.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">Practice Priorities</h3>
          <div className="space-y-2">
            {summary.priorities.map((p, i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-3">
                <div className="text-xs font-medium text-orange-400">{p.area}</div>
                <div className="text-xs text-gray-400 mt-0.5">{p.drill}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.encouragement && (
        <p className="text-sm text-gray-300 italic text-center">{summary.encouragement}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onNewSession}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
        >
          New Session
        </button>
        <button
          onClick={onViewHistory}
          className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
        >
          View History
        </button>
      </div>
    </div>
  );
}
