import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/ai";

interface ScoreResult {
  score: number;
  summary: string;
  recommendation: "STRONG_APPLY" | "APPLY" | "MAYBE" | "SKIP";
  technical_match: { score: number; matched: string[]; missing: string[] };
  experience_relevance: { score: number; reasoning: string };
  apply_rationale: string;
}

export async function POST(request: NextRequest) {
  try {
    const { jobTitle, jobDescription, company, userProfile } = await request.json();

    if (!jobDescription) {
      return NextResponse.json({ error: "jobDescription is required" }, { status: 400 });
    }

    const prompt = `Score this job for the candidate on a scale of 0-100.

JOB:
Title: ${jobTitle || "Unknown"}
Company: ${company || "Unknown"}
Description: ${jobDescription.slice(0, 3000)}

CANDIDATE PROFILE:
${userProfile || "No profile provided — score based on general SWE intern fit"}

SCORING RUBRIC:
- 85-100: Perfect match, apply immediately
- 70-84: Strong match, apply within 24h
- 55-69: Decent match, apply within a week
- 40-54: Weak match, apply if time permits
- 0-39: Poor match, skip

Return JSON:
{
  "score": <0-100>,
  "summary": "<1-sentence summary>",
  "recommendation": "<STRONG_APPLY|APPLY|MAYBE|SKIP>",
  "technical_match": { "score": <0-100>, "matched": ["skill1"], "missing": ["skill2"] },
  "experience_relevance": { "score": <0-100>, "reasoning": "<why>" },
  "apply_rationale": "<1-2 sentences on why/why not>"
}`;

    const result = await generateJSON<ScoreResult>(prompt, { temperature: 0.3 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Analysis failed", details: String(error) },
      { status: 500 }
    );
  }
}
