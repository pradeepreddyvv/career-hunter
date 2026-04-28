"use client";

import { useState, useEffect, useCallback } from "react";
import AppNav from "@/components/AppNav";

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  source: string;
  score?: number;
  postedAt: string | null;
}

interface FetchResult {
  jobs: Job[];
  total: number;
  sources: Record<string, number>;
  cached: boolean;
  fetchedAt: string;
}

const SOURCE_TABS = ["all", "greenhouse", "lever", "ashby", "muse", "remotive"] as const;

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("intern");
  const [source, setSource] = useState<string>("all");
  const [sources, setSources] = useState<Record<string, number>>({});
  const [cached, setCached] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scoring, setScoring] = useState<Record<string, boolean>>({});
  const [scores, setScores] = useState<Record<string, { score: number; summary: string; recommendation: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const fetchJobs = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("filter", filter);
      if (source !== "all") params.set("source", source);
      if (refresh) params.set("refresh", "true");
      const res = await fetch(`/api/jobs?${params}`);
      const data: FetchResult = await res.json();
      setJobs(data.jobs || []);
      setSources(data.sources || {});
      setCached(data.cached);
      setFetchedAt(data.fetchedAt);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  }, [filter, source]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  async function scoreJob(job: Job) {
    setScoring((p) => ({ ...p, [job.id]: true }));
    try {
      const res = await fetch("/api/jobs/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: job.title,
          jobDescription: job.description,
          company: job.company,
        }),
      });
      const data = await res.json();
      if (data.score !== undefined) {
        setScores((p) => ({ ...p, [job.id]: { score: data.score, summary: data.summary, recommendation: data.recommendation } }));
      }
    } catch { /* ignore */ } finally {
      setScoring((p) => ({ ...p, [job.id]: false }));
    }
  }

  async function saveJob(job: Job) {
    setSaving((p) => ({ ...p, [job.id]: true }));
    try {
      const res = await fetch("/api/jobs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, jobTitle: job.title, company: job.company, url: job.url }),
      });
      const data = await res.json();
      if (data.id) setSaved((p) => ({ ...p, [job.id]: true }));
    } catch { /* ignore */ } finally {
      setSaving((p) => ({ ...p, [job.id]: false }));
    }
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function scoreBadgeColor(score: number): string {
    if (score >= 85) return "bg-green-600/20 text-green-400";
    if (score >= 70) return "bg-blue-600/20 text-blue-400";
    if (score >= 55) return "bg-yellow-600/20 text-yellow-400";
    return "bg-red-600/20 text-red-400";
  }

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-1">Job Discovery</h1>
              <p className="text-gray-400 text-sm">
                {jobs.length > 0
                  ? `${jobs.length} jobs from ${Object.keys(sources).length} sources`
                  : "Fetching from free public ATS APIs"}
                {fetchedAt && (
                  <span className="text-gray-500">
                    {" "}&middot; {cached ? "cached" : "live"} &middot; {timeAgo(fetchedAt)}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => fetchJobs(true)}
              disabled={loading}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm disabled:opacity-50 transition-colors"
            >
              {loading ? "Fetching..." : "Refresh"}
            </button>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {SOURCE_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setSource(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  source === tab
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                {sources[tab] !== undefined && (
                  <span className="ml-1 opacity-60">({sources[tab]})</span>
                )}
                {tab === "all" && jobs.length > 0 && (
                  <span className="ml-1 opacity-60">({jobs.length})</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchJobs()}
              placeholder="Filter by title (e.g., intern, sde, frontend)"
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={() => fetchJobs()}
              disabled={loading}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Search
            </button>
          </div>

          <div className="space-y-3">
            {jobs.map((job) => {
              const jobScore = scores[job.id];
              const isExpanded = expanded === job.id;
              return (
                <div
                  key={job.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => setExpanded(isExpanded ? null : job.id)}
                    >
                      <h3 className="font-medium">{job.title}</h3>
                      <p className="text-sm text-gray-400">
                        {job.company} &mdash; {job.location}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {jobScore && (
                        <span className={`text-xs px-2 py-1 rounded font-medium ${scoreBadgeColor(jobScore.score)}`}>
                          {jobScore.score}
                        </span>
                      )}
                      <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400">
                        {job.source}
                      </span>
                      <button
                        onClick={() => scoreJob(job)}
                        disabled={scoring[job.id] || !!jobScore}
                        className="text-xs px-3 py-1 rounded bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 disabled:opacity-40 transition-colors"
                      >
                        {scoring[job.id] ? "..." : jobScore ? "Scored" : "Score"}
                      </button>
                      <button
                        onClick={() => saveJob(job)}
                        disabled={saving[job.id] || saved[job.id]}
                        className="text-xs px-3 py-1 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-40 transition-colors"
                      >
                        {saved[job.id] ? "Saved" : saving[job.id] ? "..." : "Save"}
                      </button>
                      {job.url && (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-3 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                        >
                          Apply
                        </a>
                      )}
                    </div>
                  </div>
                  {jobScore?.summary && (
                    <p className="text-xs text-gray-500 mt-2">{jobScore.summary}</p>
                  )}
                  {isExpanded && job.description && (
                    <div className="mt-3 pt-3 border-t border-gray-800">
                      <div
                        className="text-xs text-gray-400 leading-relaxed max-h-64 overflow-y-auto prose prose-invert prose-xs"
                        dangerouslySetInnerHTML={{ __html: job.description.slice(0, 5000) }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {jobs.length === 0 && !loading && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg mb-2">No jobs found</p>
              <p className="text-sm">
                Try a different filter or click Refresh to fetch live from 82 companies across 5 ATS platforms.
              </p>
            </div>
          )}

          {loading && jobs.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg mb-2">Fetching jobs...</p>
              <p className="text-sm">Querying Greenhouse, Lever, Ashby, The Muse, and Remotive APIs</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
