import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/ai";
import { buildJobScoringPrompt } from "@/lib/prompts";

interface ScoreResult {
  overall_score: number;
  dimension_scores: {
    role_alignment: number;
    technical_alignment: number;
    evidence_strength: number;
    practical_fit: number;
  };
  top_matching_signals: string[];
  top_gaps: string[];
  ats_keywords: string[];
  recommendation: string;
  apply_rationale: string;
}

export async function POST(request: NextRequest) {
  try {
    const { jobTitle, jobDescription, company, userProfile } = await request.json();

    if (!jobDescription) {
      return NextResponse.json({ error: "jobDescription is required" }, { status: 400 });
    }

    const prompt = buildJobScoringPrompt({
      jobTitle: jobTitle || "Unknown",
      company: company || "Unknown",
      jobDescription: jobDescription.slice(0, 4000),
      userProfile,
    });

    const result = await generateJSON<ScoreResult>(prompt, { temperature: 0.3 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Analysis failed", details: String(error) },
      { status: 500 }
    );
  }
}
