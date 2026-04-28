"use client";

import type { AIState, FeedbackResult } from "@/types/interview";

interface Props {
  feedback: FeedbackResult | null;
  state: AIState;
  streamTokens: string;
  error: string | null;
  onRetry?: () => void;
  onNext?: () => void;
}

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = (score / 100) * circumference;
  const color =
    score >= 80 ? "#22c55e" : score >= 60 ? "#eab308" : score >= 40 ? "#f97316" : "#ef4444";

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f2937" strokeWidth="6" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - progress}
        strokeLinecap="round"
        className="transition-all duration-1000"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="transform rotate-90 origin-center"
        fill="white"
        fontSize="18"
        fontWeight="bold"
      >
        {score}
      </text>
    </svg>
  );
}

function STARBar({ label, score }: { label: string; score: number }) {
  const color =
    score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : score >= 40 ? "bg-orange-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-20">{label}</span>
      <div className="flex-1 bg-gray-800 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{score}</span>
    </div>
  );
}

export default function FeedbackCard({ feedback, state, streamTokens, error, onRetry, onNext }: Props) {
  if (state === "idle") return null;

  if (state === "thinking") {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-sm text-gray-400">Analyzing your answer...</span>
        </div>
      </div>
    );
  }

  if (state === "streaming") {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-xs text-gray-500">Streaming feedback...</span>
        </div>
        <pre className="text-xs text-gray-400 whitespace-pre-wrap overflow-auto max-h-60">
          {streamTokens}
        </pre>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="bg-gray-900 border border-red-800/50 rounded-xl p-5">
        <p className="text-sm text-red-400 mb-3">{error || "Something went wrong"}</p>
        {onRetry && (
          <button onClick={onRetry} className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm">
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!feedback) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
      <div className="flex items-start gap-5">
        <ScoreRing score={feedback.overallScore} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                feedback.recommendation === "Strong"
                  ? "bg-green-500/20 text-green-400"
                  : feedback.recommendation === "Good"
                    ? "bg-blue-500/20 text-blue-400"
                    : feedback.recommendation === "Needs Work"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-red-500/20 text-red-400"
              }`}
            >
              {feedback.recommendation}
            </span>
            {feedback.lpAlignment > 0 && (
              <span className="text-xs text-gray-500">LP Alignment: {feedback.lpAlignment}%</span>
            )}
          </div>
          <div className="space-y-1.5">
            <STARBar label="Situation" score={feedback.star.situation} />
            <STARBar label="Task" score={feedback.star.task} />
            <STARBar label="Action" score={feedback.star.action} />
            <STARBar label="Result" score={feedback.star.result} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {Object.entries(feedback.dimensions).map(([key, val]) => (
          <div key={key} className="text-center">
            <div className="text-lg font-bold">{val}</div>
            <div className="text-[10px] text-gray-500 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</div>
          </div>
        ))}
      </div>

      {feedback.delivery && (
        <div className="flex gap-4 text-xs text-gray-400 bg-gray-800 rounded-lg p-3">
          <span>Fillers: {feedback.delivery.fillerWords}</span>
          <span>Hedging: {feedback.delivery.hedgingPhrases}</span>
          <span>Power words: {feedback.delivery.powerWords}</span>
          <span className={feedback.delivery.pacing === "good" ? "text-green-400" : "text-yellow-400"}>
            Pacing: {feedback.delivery.pacing}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-medium text-green-400 mb-1">Strengths</h4>
          <ul className="text-xs text-gray-400 space-y-1">
            {feedback.strengths.map((s, i) => (
              <li key={i}>+ {s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-medium text-yellow-400 mb-1">Improvements</h4>
          <ul className="text-xs text-gray-400 space-y-1">
            {feedback.improvements.map((s, i) => (
              <li key={i}>- {s}</li>
            ))}
          </ul>
        </div>
      </div>

      {feedback.coachingTip && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
          <h4 className="text-xs font-medium text-blue-400 mb-1">Coaching Tip</h4>
          <p className="text-xs text-gray-300">{feedback.coachingTip}</p>
        </div>
      )}

      {onNext && (
        <button
          onClick={onNext}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
        >
          Next Question
        </button>
      )}
    </div>
  );
}
