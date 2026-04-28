"use client";

import { useState, useEffect } from "react";
import AppNav from "@/components/AppNav";

export default function CoverLetterPage() {
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile?.resume_text && !resumeText) {
          setResumeText(data.profile.resume_text);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    if (!jobDescription) {
      setError("Job description is required.");
      return;
    }
    setLoading(true);
    setError("");
    setCoverLetter("");

    try {
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle, jobDescription, company, resumeText }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setCoverLetter(data.coverLetter);
      }
    } catch {
      setError("Failed to generate cover letter.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Cover Letter</h1>
          <p className="text-gray-400 mb-6">Generate a role-adaptive cover letter with company-specific hooks</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Job Title</label>
                  <input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Software Engineer Intern"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Company</label>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Stripe"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Job Description</label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the job description..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm min-h-[160px] focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Your Resume (optional, improves quality)</label>
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste resume text for personalized metrics..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm min-h-[120px] focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>

              <button
                onClick={generate}
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {loading ? "Writing..." : "Generate Cover Letter"}
              </button>

              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            <div>
              {coverLetter ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium">Generated Cover Letter</h3>
                    <button
                      onClick={() => navigator.clipboard.writeText(coverLetter)}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {coverLetter}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                  <p className="text-gray-500 text-sm">
                    Paste a job description to generate a tailored cover letter.
                  </p>
                  <p className="text-gray-600 text-xs mt-2">
                    4 paragraphs, 250-320 words, company-specific hooks, real metrics.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
