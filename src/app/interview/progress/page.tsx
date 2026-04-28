"use client";

import { useState, useEffect } from "react";
import AppNav from "@/components/AppNav";

interface WeakArea {
  area: string;
  total_occurrences: number;
  avg_score: number;
  trend: "improving" | "declining" | "stable";
  score_history: number[];
}

interface Stats {
  totalSessions: number;
  totalAnswers: number;
  avgScore: number;
  totalMinutes: number;
}

export default function ProgressPage() {
  const [weakAreas, setWeakAreas] = useState<WeakArea[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/interview/progress").then((r) => r.json()),
      fetch("/api/interview/progress?type=stats").then((r) => r.json()),
    ])
      .then(([areas, s]) => {
        setWeakAreas(areas.weakAreas || []);
        setStats(s);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const trendIcon = (trend: string) => {
    if (trend === "improving") return <span className="text-green-400">↑</span>;
    if (trend === "declining") return <span className="text-red-400">↓</span>;
    return <span className="text-gray-500">→</span>;
  };

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Progress</h1>
          <p className="text-gray-400 mb-6">Track your weak areas and improvement trends</p>

          {loading ? (
            <div className="text-gray-500">Loading...</div>
          ) : (
            <>
              {stats && (
                <div className="grid grid-cols-4 gap-4 mb-8">
                  {[
                    { label: "Sessions", value: stats.totalSessions },
                    { label: "Answers", value: stats.totalAnswers },
                    { label: "Avg Score", value: stats.avgScore },
                    { label: "Minutes", value: stats.totalMinutes },
                  ].map((s) => (
                    <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold">{s.value}</div>
                      <div className="text-xs text-gray-500">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {weakAreas.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                  <p className="text-gray-400 mb-3">No weak areas identified yet</p>
                  <a href="/interview" className="text-blue-400 hover:text-blue-300 text-sm">
                    Complete a session to see trends
                  </a>
                </div>
              ) : (
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold">Weak Areas</h2>
                  {weakAreas.map((wa) => (
                    <div key={wa.area} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{wa.area}</span>
                          {trendIcon(wa.trend)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{wa.total_occurrences} occurrences</span>
                          <span
                            className={`font-bold ${
                              wa.avg_score >= 70
                                ? "text-green-400"
                                : wa.avg_score >= 50
                                  ? "text-yellow-400"
                                  : "text-red-400"
                            }`}
                          >
                            Avg: {Math.round(wa.avg_score)}
                          </span>
                        </div>
                      </div>
                      {wa.score_history.length > 1 && (
                        <div className="flex items-end gap-0.5 h-8">
                          {wa.score_history.map((score, i) => (
                            <div
                              key={i}
                              className={`flex-1 rounded-sm ${
                                score >= 70 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500"
                              }`}
                              style={{ height: `${(score / 100) * 100}%` }}
                              title={`Score: ${score}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
