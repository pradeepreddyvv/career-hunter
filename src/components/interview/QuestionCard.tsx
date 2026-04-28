"use client";

import type { Question } from "@/types/interview";

interface Props {
  question: Question;
  index: number;
  total: number;
  onSpeak?: () => void;
  speaking?: boolean;
}

export default function QuestionCard({ question, index, total, onSpeak, speaking }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500">
            Q{index + 1} of {total}
          </span>
          {question.lp && (
            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs font-medium">
              {question.lp}
            </span>
          )}
        </div>
        {onSpeak && (
          <button
            onClick={onSpeak}
            className={`p-2 rounded-lg transition-colors ${
              speaking ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
            title="Read question aloud"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          </button>
        )}
      </div>

      <p className="text-lg font-medium mb-2">{question.text}</p>

      {question.lpFull && (
        <p className="text-xs text-gray-500 italic">{question.lpFull}</p>
      )}

      <div className="mt-3 w-full bg-gray-800 rounded-full h-1">
        <div
          className="bg-blue-600 h-1 rounded-full transition-all duration-300"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
