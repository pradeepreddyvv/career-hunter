"use client";

import { useState, useEffect } from "react";
import AppNav from "@/components/AppNav";

interface RecentSession {
  id: string;
  company: string;
  role: string;
  avgScore: number;
  startedAt: string;
}

interface RecentApplication {
  id: string;
  status: string;
  jobTitle: string;
  company: string;
  updatedAt: string;
}

interface Stats {
  jobs: number;
  applications: number;
  sessions: number;
  avgScore: number;
  documents: number;
  leetcodeSnapshots: number;
  recentSessions: RecentSession[];
  recentApplications: RecentApplication[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    jobs: 0, applications: 0, sessions: 0, avgScore: 0,
    documents: 0, leetcodeSnapshots: 0, recentSessions: [], recentApplications: [],
  });

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-gray-400 mb-8">Your career prep at a glance</p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <MetricCard title="Jobs Found" value={String(stats.jobs)} />
            <MetricCard title="Applications" value={String(stats.applications)} />
            <MetricCard title="Interviews" value={String(stats.sessions)} />
            <MetricCard title="Avg Score" value={stats.avgScore > 0 ? String(stats.avgScore) : "—"} />
            <MetricCard title="Documents" value={String(stats.documents)} />
            <MetricCard title="LeetCode" value={String(stats.leetcodeSnapshots)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <ActionButton href="/jobs" label="Browse Jobs" description="Discover from 82+ companies" />
                <ActionButton href="/interview" label="Practice Interview" description="Behavioral with AI feedback" />
                <ActionButton href="/interview/live" label="Live Interview" description="Conversational AI mock" />
                <ActionButton href="/leetcode" label="LeetCode Coach" description="3 AI personas" />
                <ActionButton href="/resume" label="Generate Resume" description="ATS-tailored per job" />
                <ActionButton href="/pipeline" label="Track Applications" description="Kanban pipeline" />
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Recent Interviews</h2>
              {stats.recentSessions.length > 0 ? (
                <div className="space-y-2">
                  {stats.recentSessions.map((s) => (
                    <a
                      key={s.id}
                      href="/interview/history"
                      className="block p-2 rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm">{s.company}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          s.avgScore >= 70 ? "bg-green-900/30 text-green-400" :
                          s.avgScore >= 50 ? "bg-yellow-900/30 text-yellow-400" :
                          "bg-gray-800 text-gray-400"
                        }`}>
                          {s.avgScore > 0 ? s.avgScore : "—"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{s.role || "General"}</p>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No sessions yet. Start a practice interview!</p>
              )}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Recent Applications</h2>
              {stats.recentApplications.length > 0 ? (
                <div className="space-y-2">
                  {stats.recentApplications.map((a) => (
                    <a
                      key={a.id}
                      href="/pipeline"
                      className="block p-2 rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm truncate">{a.jobTitle}</span>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="text-xs text-gray-500">{a.company}</p>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No applications yet. Browse jobs and save some!</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-400">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function ActionButton({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <a href={href} className="block p-3 rounded-lg border border-gray-700 hover:border-blue-500/50 hover:bg-gray-800/50 transition-colors">
      <p className="font-medium text-sm">{label}</p>
      <p className="text-xs text-gray-500">{description}</p>
    </a>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: "bg-blue-900/30 text-blue-400",
    applied: "bg-purple-900/30 text-purple-400",
    interview: "bg-yellow-900/30 text-yellow-400",
    offer: "bg-green-900/30 text-green-400",
    rejected: "bg-red-900/30 text-red-400",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${colors[status] || "bg-gray-800 text-gray-400"}`}>
      {status}
    </span>
  );
}
