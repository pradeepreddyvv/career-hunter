import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/ai";
import { buildCoverLetterPrompt } from "@/lib/prompts";

export async function POST(request: NextRequest) {
  try {
    const { jobTitle, jobDescription, company, resumeText, targetRole, companyResearch } = await request.json();

    if (!jobDescription) {
      return NextResponse.json({ error: "jobDescription is required" }, { status: 400 });
    }

    const prompt = buildCoverLetterPrompt({
      jobTitle: jobTitle || "Software Engineer",
      company: company || "the company",
      jobDescription: jobDescription.slice(0, 4000),
      resumeText: resumeText?.slice(0, 4000),
      targetRole,
      companyResearch,
    });

    const result = await generateText(prompt, {
      temperature: 0.5,
      systemPrompt: "You write concise, metric-driven cover letters. Return valid JSON only.",
    });

    const cleaned = result.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({ coverLetter: parsed.cover_letter || cleaned, structured: parsed, provider: result.provider });
    } catch {
      return NextResponse.json({ coverLetter: result.text, provider: result.provider });
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Cover letter generation failed", details: String(error) },
      { status: 500 }
    );
  }
}
