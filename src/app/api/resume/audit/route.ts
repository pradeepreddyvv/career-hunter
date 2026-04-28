import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/ai";
import { buildATSAuditPrompt } from "@/lib/prompts";

interface AuditResult {
  keyword_coverage_pct: number;
  matched_keywords: string[];
  missing_keywords: { keyword: string; where_to_add: string; suggested_phrase: string }[];
  unsupported_claims: string[];
  verb_repetitions: string[];
  role_emphasis_issues: string[];
  top_5_fixes: string[];
  overall_score: number;
  recommendation: string;
}

export async function POST(request: NextRequest) {
  try {
    const { jobDescription, generatedResume, masterResume } = await request.json();

    if (!jobDescription || !generatedResume) {
      return NextResponse.json(
        { error: "jobDescription and generatedResume are required" },
        { status: 400 }
      );
    }

    const prompt = buildATSAuditPrompt({
      jobDescription: jobDescription.slice(0, 4000),
      generatedResume: generatedResume.slice(0, 4000),
      masterResume: masterResume?.slice(0, 3000),
    });

    const result = await generateJSON<AuditResult>(prompt, { temperature: 0.2 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "ATS audit failed", details: String(error) },
      { status: 500 }
    );
  }
}
