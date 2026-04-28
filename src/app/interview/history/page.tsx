"use client";

import { useState, useEffect } from "react";
import AppNav from "@/components/AppNav";

interface Session {
  id: string;
  company: string;
  role: string;
  started_at: string;
  completed_at: string | null;
  question_count: number;
  avg_score: number;
  weak_areas: string[];
  summary: Record<string, unknown> | null;
}

interface Answer {
  id: string;
  question_text: string;
  question_lp: string;
  answer_text: string;
  feedback: Record<string, unknown> | null;
  score: number;
  duration_sec: number;
  created_at: string;
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/interview/sessions")
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) {
      setAnswers([]);
      return;
    }
    fetch(`/api/interview/sessions?id=${selected}`)
      .then((r) => r.json())
      .then((data) => setAnswers(data.answers || []))
      .catch(() => setAnswers([]));
  }, [selected]);

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Session History</h1>
          <p className="text-gray-400 mb-6">Review past sessions and answers</p>

          {loading ? (
            <div className="text-gray-500">Loading...</div>
          ) : sessions.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-400 mb-3">No sessions yet</p>
              <a href="/interview" className="text-blue-400 hover:text-blue-300 text-sm">
                Start your first interview
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-2">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selected === s.id
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-gray-800 bg-gray-900 hover:border-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{s.company || "General"}</span>
                      <span
                        className={`text-sm font-bold ${
                          s.avg_score >= 70
                            ? "text-green-400"
                            : s.avg_score >= 50
                              ? "text-yellow-400"
                              : "text-red-400"
                        }`}
                      >
                        {Math.round(s.avg_score)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(s.started_at).toLocaleDateString()} · {s.question_count} questions
                      {s.completed_at ? " · Complete" : " · In progress"}
                    </div>
                  </button>
                ))}
              </div>

              <div className="lg:col-span-2 space-y-3">
                {selected && answers.length === 0 && (
                  <div className="text-gray-500 text-sm">No answers recorded for this session.</div>
                )}
                {answers.map((a) => {
                  const fb = a.feedback as Record<string, unknown> | null;
                  return (
                    <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {a.question_lp && (
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs">
                            {a.question_lp}
                          </span>
                        )}
                        <span
                          className={`text-sm font-bold ${
                            a.score >= 70
                              ? "text-green-400"
                              : a.score >= 50
                                ? "text-yellow-400"
                                : "text-red-400"
                          }`}
                        >
                          {Math.round(a.score)}/100
                        </span>
                        <span className="text-xs text-gray-600 ml-auto">
                          {a.duration_sec > 0 && `${Math.floor(a.duration_sec / 60)}:${(a.duration_sec % 60).toString().padStart(2, "0")}`}
                        </span>
                      </div>
                      <p className="text-sm font-medium mb-1">{a.question_text}</p>
                      <p className="text-xs text-gray-400 mb-2 line-clamp-3">{a.answer_text}</p>
                      {fb && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {(fb.strengths as string[] | undefined)?.map((s: string, i: number) => (
                            <span key={i} className="text-green-400">+ {s}</span>
                          ))}
                          {(fb.improvements as string[] | undefined)?.map((s: string, i: number) => (
                            <span key={i} className="text-yellow-400">- {s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
