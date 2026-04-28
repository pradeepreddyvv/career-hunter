"use client";

import { useState, useEffect } from "react";
import AppNav from "@/components/AppNav";

interface Profile {
  name: string;
  email: string;
  background: string;
  target_role: string;
  target_company: string;
  experience: string;
  skills: string;
  resume_text: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({
    name: "",
    email: "",
    background: "",
    target_role: "",
    target_company: "",
    experience: "",
    skills: "",
    resume_text: "",
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) setProfile(data.profile);
      })
      .catch(() => {});
  }, []);

  async function save() {
    setLoading(true);
    setSaved(false);
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function update(field: keyof Profile, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Profile</h1>
          <p className="text-gray-400 mb-6">Your profile powers personalized resume and cover letter generation</p>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Full Name" value={profile.name} onChange={(v) => update("name", v)} placeholder="Your Name" />
              <Field label="Email" value={profile.email} onChange={(v) => update("email", v)} placeholder="you@email.com" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Target Role" value={profile.target_role} onChange={(v) => update("target_role", v)} placeholder="SDE Intern" />
              <Field label="Target Company" value={profile.target_company} onChange={(v) => update("target_company", v)} placeholder="Google, Amazon, etc." />
            </div>

            <Field label="Background" value={profile.background} onChange={(v) => update("background", v)} placeholder="MSCS at ASU, 2yr SWE experience, etc." />
            <Field label="Experience Summary" value={profile.experience} onChange={(v) => update("experience", v)} placeholder="Brief summary of your work experience" />
            <Field label="Technical Skills" value={profile.skills} onChange={(v) => update("skills", v)} placeholder="Python, TypeScript, React, AWS, etc." />

            <div>
              <label className="text-xs text-gray-400 block mb-1">Master Resume Text</label>
              <textarea
                value={profile.resume_text}
                onChange={(e) => update("resume_text", e.target.value)}
                placeholder="Paste your full resume text here. This is used as the source for AI-tailored resumes."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm min-h-[200px] focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={loading}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {loading ? "Saving..." : "Save Profile"}
              </button>
              {saved && <span className="text-green-400 text-sm">Saved</span>}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
