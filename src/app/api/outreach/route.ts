import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/ai";

interface OutreachResult {
  linkedin_message: string;
  cold_email: { subject: string; body: string };
  referral_ask: string;
}

export async function POST(request: NextRequest) {
  try {
    const { jobTitle, company, jobDescription, resumeText, contactName, contactRole } = await request.json();

    if (!company) {
      return NextResponse.json({ error: "company is required" }, { status: 400 });
    }

    const prompt = `Generate 3 outreach messages for a job application.

=== CONTEXT ===
Target Role: ${jobTitle || "Software Engineer"}
Company: ${company}
Contact: ${contactName || "Hiring Manager"} (${contactRole || "unknown role"})
${jobDescription ? `Job Description (excerpt): ${jobDescription.slice(0, 1500)}` : ""}
${resumeText ? `Candidate Resume (excerpt): ${resumeText.slice(0, 1500)}` : ""}

=== MESSAGE 1: LINKEDIN CONNECTION REQUEST ===
- Max 300 characters (LinkedIn limit for connection requests)
- Mention a specific detail about the company or team
- State what role you're interested in
- End with a soft ask (e.g., "would love to connect")
- No "Dear" or formal greetings — LinkedIn is casual

=== MESSAGE 2: COLD EMAIL ===
- Subject line: short, specific, no generic "Job Application" (e.g., "SDE Intern — [specific skill] background")
- Body: 150-200 words max
- P1: One-sentence hook showing you know the company
- P2: Your strongest 1-2 achievements with metrics
- P3: Specific ask (informational chat, referral, or application review)
- Include "[JOB_LINK_PLACEHOLDER]" where the job link would go
- Professional but not stiff

=== MESSAGE 3: REFERRAL ASK ===
- For someone you have a loose connection with (alumni, mutual connection, same school)
- 100-150 words
- Acknowledge the relationship context
- Be specific about the role
- Make it easy to say yes (offer to send resume, provide job link)
- Include "[JOB_LINK_PLACEHOLDER]"

=== CONSTRAINTS ===
- NEVER use "passionate" or "enthusiastic"
- Include real metrics from the resume if provided
- ${contactName !== undefined ? `Address ${contactName} by first name` : "Use generic but natural phrasing"}
- Tone: confident, specific, respectful of their time

Return JSON: { "linkedin_message": "...", "cold_email": { "subject": "...", "body": "..." }, "referral_ask": "..." }`;

    const result = await generateJSON<OutreachResult>(prompt, { temperature: 0.5 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Outreach generation failed", details: String(error) },
      { status: 500 }
    );
  }
}
