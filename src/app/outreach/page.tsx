"use client";

import { useState, useEffect } from "react";
import AppNav from "@/components/AppNav";

interface OutreachResult {
  linkedin_message: string;
  cold_email: { subject: string; body: string };
  referral_ask: string;
}

export default function OutreachPage() {
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [result, setResult] = useState<OutreachResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile?.resume_text) setResumeText(data.profile.resume_text);
      })
      .catch(() => {});
  }, []);

  async function generate() {
    if (!company) {
      setError("Company name is required.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle, company, jobDescription, resumeText, contactName, contactRole }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("Failed to generate outreach messages.");
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Outreach</h1>
          <p className="text-gray-400 mb-6">Generate LinkedIn DMs, cold emails, and referral asks</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Company *</label>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Google"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Job Title</label>
                  <input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="SDE Intern"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Contact Name</label>
                  <input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Contact Role</label>
                  <input
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    placeholder="Recruiter, SDE, Manager"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Job Description (optional)</label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste JD for more targeted messages..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm min-h-[100px] focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Your Resume (auto-filled from profile)</label>
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste resume for personalized metrics..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm min-h-[80px] focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>

              <button
                onClick={generate}
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {loading ? "Generating..." : "Generate Outreach Messages"}
              </button>

              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            <div className="space-y-4">
              {result ? (
                <>
                  <MessageCard
                    title="LinkedIn Connection Request"
                    content={result.linkedin_message}
                    charLimit={300}
                    onCopy={() => copy(result.linkedin_message, "linkedin")}
                    isCopied={copied === "linkedin"}
                  />
                  <MessageCard
                    title={`Cold Email — ${result.cold_email.subject}`}
                    content={result.cold_email.body}
                    onCopy={() => copy(`Subject: ${result.cold_email.subject}\n\n${result.cold_email.body}`, "email")}
                    isCopied={copied === "email"}
                  />
                  <MessageCard
                    title="Referral Ask"
                    content={result.referral_ask}
                    onCopy={() => copy(result.referral_ask, "referral")}
                    isCopied={copied === "referral"}
                  />
                </>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                  <p className="text-gray-500 text-sm">
                    Enter a company name and click Generate.
                  </p>
                  <p className="text-gray-600 text-xs mt-2">
                    You&apos;ll get a LinkedIn DM, cold email, and referral ask — all personalized.
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

function MessageCard({
  title,
  content,
  charLimit,
  onCopy,
  isCopied,
}: {
  title: string;
  content: string;
  charLimit?: number;
  onCopy: () => void;
  isCopied: boolean;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <button
          onClick={onCopy}
          className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs transition-colors"
        >
          {isCopied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{content}</div>
      {charLimit && (
        <p className={`text-xs mt-2 ${content.length > charLimit ? "text-red-400" : "text-gray-500"}`}>
          {content.length}/{charLimit} chars
        </p>
      )}
    </div>
  );
}
