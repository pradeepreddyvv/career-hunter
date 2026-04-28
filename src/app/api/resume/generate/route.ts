import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/ai";
import { buildResumePrompt } from "@/lib/prompts";

export async function POST(request: NextRequest) {
  try {
    const { jobTitle, jobDescription, company, resumeText, targetRole, companyResearch } = await request.json();

    if (!jobDescription || !resumeText) {
      return NextResponse.json(
        { error: "jobDescription and resumeText are required" },
        { status: 400 }
      );
    }

    const prompt = buildResumePrompt({
      jobTitle: jobTitle || "Software Engineer",
      company: company || "Unknown",
      jobDescription: jobDescription.slice(0, 6000),
      resumeText: resumeText.slice(0, 5000),
      targetRole,
      companyResearch,
    });

    const result = await generateText(prompt, {
      temperature: 0.3,
      systemPrompt: "You are an expert ATS resume writer. Return valid JSON only.",
    });

    const cleaned = result.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({ resume: parsed.tailored_resume || cleaned, structured: parsed, provider: result.provider });
    } catch {
      return NextResponse.json({ resume: result.text, provider: result.provider });
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Resume generation failed", details: String(error) },
      { status: 500 }
    );
  }
}
