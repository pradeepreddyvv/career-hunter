"use client";

import { useState } from "react";
import type { InterviewFormat } from "@/types/interview";

const FORMATS: { value: InterviewFormat; label: string; desc: string; questions: number; followUps: number }[] = [
  { value: "standard", label: "Standard", desc: "5 questions, 1 follow-up each", questions: 5, followUps: 1 },
  { value: "deep_dive", label: "Deep Dive", desc: "3 questions, 2-3 follow-ups each", questions: 3, followUps: 3 },
  { value: "rapid_fire", label: "Rapid Fire", desc: "8 questions, no follow-ups", questions: 8, followUps: 0 },
  { value: "full_loop", label: "Full Loop", desc: "4 rounds simulating real interviews", questions: 4, followUps: 2 },
];

const COMPANIES = ["Amazon", "Google", "Meta", "Microsoft", "Apple", "Netflix", "Startup"];

interface Props {
  onStart: (config: {
    format: InterviewFormat;
    company: string;
    numQuestions: number;
    maxFollowUps: number;
  }) => void;
}

export default function InterviewConfig({ onStart }: Props) {
  const [format, setFormat] = useState<InterviewFormat>("standard");
  const [company, setCompany] = useState("Amazon");

  const selected = FORMATS.find((f) => f.value === format)!;

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-1">Configure Interview</h2>
      <p className="text-gray-400 text-sm mb-6">Choose your format and target company</p>

      <div className="space-y-6">
        <div>
          <label className="text-sm font-medium text-gray-300 block mb-3">Format</label>
          <div className="grid grid-cols-2 gap-3">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  format === f.value
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-gray-800 bg-gray-900 hover:border-gray-700"
                }`}
              >
                <div className="font-medium text-sm">{f.label}</div>
                <div className="text-xs text-gray-400 mt-1">{f.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-300 block mb-2">Company</label>
          <div className="flex flex-wrap gap-2">
            {COMPANIES.map((c) => (
              <button
                key={c}
                onClick={() => setCompany(c)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  company === c
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() =>
            onStart({
              format,
              company,
              numQuestions: selected.questions,
              maxFollowUps: selected.followUps,
            })
          }
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition-colors"
        >
          Start Interview ({selected.questions} questions)
        </button>
      </div>
    </div>
  );
}
