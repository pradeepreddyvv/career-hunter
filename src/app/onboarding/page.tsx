"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppNav from "@/components/AppNav";

const ROLE_OPTIONS = [
  "Software Engineer", "Frontend Engineer", "Backend Engineer", "Full Stack",
  "ML/AI Engineer", "Data Scientist", "DevOps/SRE", "Mobile Developer",
  "Product Manager", "Data Engineer",
];

const COMPANY_PRESETS = ["Google", "Amazon", "Meta", "Microsoft", "Apple", "Netflix", "Startup"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [background, setBackground] = useState("");
  const [experience, setExperience] = useState("");
  const [skills, setSkills] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [targetCompany, setTargetCompany] = useState("Amazon");
  const [customCompany, setCustomCompany] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile?.name && data.profile?.resume_text) {
          router.replace("/");
        } else if (data.profile) {
          const p = data.profile;
          if (p.name) setName(p.name);
          if (p.email) setEmail(p.email);
          if (p.background) setBackground(p.background);
          if (p.experience) setExperience(p.experience);
          if (p.skills) setSkills(p.skills);
          if (p.resume_text) setResumeText(p.resume_text);
          if (p.target_role) setTargetRole(p.target_role);
          if (p.target_company) setTargetCompany(p.target_company);
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function finish() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          background,
          experience,
          skills,
          resume_text: resumeText,
          target_role: targetRole,
          target_company: COMPANY_PRESETS.includes(targetCompany) ? targetCompany : customCompany || targetCompany,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      router.push("/");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <>
        <AppNav />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Loading...</div>
        </main>
      </>
    );
  }

  const steps = [
    { label: "Profile", desc: "Name & background" },
    { label: "Resume", desc: "Paste your resume" },
    { label: "Target", desc: "Role & company" },
  ];

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-2 text-center">Welcome to Career Hunter</h1>
          <p className="text-gray-400 text-center mb-8">Set up your profile so AI can personalize everything for you</p>

          {/* Step indicator */}
          <div className="flex justify-center gap-3 mb-8">
            {steps.map((s, i) => (
              <button
                key={s.label}
                onClick={() => i + 1 <= step && setStep(i + 1)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  i + 1 === step
                    ? "bg-blue-600 text-white"
                    : i + 1 < step
                    ? "bg-green-900/30 text-green-400"
                    : "bg-gray-800 text-gray-500"
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-black/20 flex items-center justify-center text-xs font-bold">
                  {i + 1 < step ? "✓" : i + 1}
                </span>
                {s.label}
              </button>
            ))}
          </div>

          {/* Step 1: Profile */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Your Details</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Name *</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Email</label>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Background</label>
                  <input value={background} onChange={(e) => setBackground(e.target.value)} placeholder="e.g., CS student at ASU, 2 years backend at fintech" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Experience</label>
                  <textarea value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="Key achievements with metrics: Built 100+ TPS APIs, reduced costs 50%..." rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-y" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Skills</label>
                  <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Python, Java, React, AWS, PostgreSQL, Docker..." className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Resume */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Your Resume</h2>
                <p className="text-sm text-gray-400">Upload a PDF/DOCX or paste your resume text. This powers personalized resumes, cover letters, outreach, and interview prep.</p>
                <label className="flex items-center justify-center gap-3 px-4 py-6 rounded-lg border-2 border-dashed border-gray-700 hover:border-blue-500 cursor-pointer transition-colors bg-gray-800/50">
                  <span className="text-sm text-gray-300">Upload PDF, DOCX, or TXT</span>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setLoading(true);
                      try {
                        const fd = new FormData();
                        fd.append("file", file);
                        const res = await fetch("/api/resume/parse", { method: "POST", body: fd });
                        const data = await res.json();
                        if (data.text) setResumeText(data.text);
                      } catch { /* ignore */ }
                      finally { setLoading(false); }
                      e.target.value = "";
                    }}
                  />
                </label>
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Or paste your complete resume text here..."
                  rows={12}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-y font-mono"
                />
                {resumeText && (
                  <p className="text-xs text-green-400">{resumeText.split(/\s+/).length} words loaded</p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Target */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Target Role</h2>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setTargetRole(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        targetRole === r ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Target Company</h2>
                <div className="flex flex-wrap gap-2">
                  {COMPANY_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setTargetCompany(c); setCustomCompany(""); }}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        targetCompany === c ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                  <button
                    onClick={() => setTargetCompany("Other")}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      targetCompany === "Other" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    Other
                  </button>
                </div>
                {targetCompany === "Other" && (
                  <input
                    value={customCompany}
                    onChange={(e) => setCustomCompany(e.target.value)}
                    placeholder="Enter company name"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400">{error}</div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-6">
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="px-5 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors disabled:opacity-30"
            >
              Back
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 1 && !name.trim()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-30"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={loading || !name.trim()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-30"
              >
                {loading ? "Saving..." : "Finish Setup"}
              </button>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
