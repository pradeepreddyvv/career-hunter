"use client";

import { useState, useEffect } from "react";
import AppNav from "@/components/AppNav";

export default function ResumePage() {
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [generatedResume, setGeneratedResume] = useState("");
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
    if (!jobDescription || !resumeText) {
      setError("Both job description and your resume are required.");
      return;
    }
    setLoading(true);
    setError("");
    setGeneratedResume("");

    try {
      const res = await fetch("/api/resume/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle, jobDescription, company, resumeText }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setGeneratedResume(data.resume);
      }
    } catch {
      setError("Failed to generate resume. Check your AI provider configuration.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Resume Builder</h1>
          <p className="text-gray-400 mb-6">Generate an ATS-optimized resume tailored to a specific job</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
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
                      placeholder="Google"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Job Description</label>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the full job description here..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm min-h-[180px] focus:border-blue-500 focus:outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Your Master Resume</label>
                  <textarea
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                    placeholder="Paste your full resume text here..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm min-h-[180px] focus:border-blue-500 focus:outline-none resize-none"
                  />
                </div>

                <button
                  onClick={generate}
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {loading ? "Generating..." : "Generate Tailored Resume"}
                </button>

                {error && <p className="text-sm text-red-400">{error}</p>}
              </div>
            </div>

            <div>
              {generatedResume ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium">Generated Resume</h3>
                    <button
                      onClick={() => navigator.clipboard.writeText(generatedResume)}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                    {generatedResume}
                  </pre>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                  <p className="text-gray-500 text-sm">
                    Paste a job description and your resume, then click Generate.
                  </p>
                  <p className="text-gray-600 text-xs mt-2">
                    The AI will select the most relevant bullets and mirror JD keywords.
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
