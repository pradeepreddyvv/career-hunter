import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/ai";
import { buildOutreachPrompt } from "@/lib/prompts";

interface OutreachResult {
  linkedin_note: string;
  linkedin_dm: string;
  cold_email: { subject: string; body: string };
  referral_ask: string;
}

export async function POST(request: NextRequest) {
  try {
    const { jobTitle, company, jobDescription, resumeText, contactName, contactRole } = await request.json();

    if (!company) {
      return NextResponse.json({ error: "company is required" }, { status: 400 });
    }

    const prompt = buildOutreachPrompt({
      jobTitle: jobTitle || "Software Engineer",
      company,
      jobDescription,
      resumeText,
      contactName,
      contactRole,
    });

    const result = await generateJSON<OutreachResult>(prompt, { temperature: 0.5 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Outreach generation failed", details: String(error) },
      { status: 500 }
    );
  }
}
