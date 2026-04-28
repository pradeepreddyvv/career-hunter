import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const { jobTitle, jobDescription, company, resumeText, targetRole } = await request.json();

    if (!jobDescription) {
      return NextResponse.json({ error: "jobDescription is required" }, { status: 400 });
    }

    const prompt = `You are a career strategist. Write a tailored cover letter.

=== JOB DETAILS ===
Title: ${jobTitle || "Software Engineer"}
Company: ${company || "the company"}
Description:
${jobDescription.slice(0, 3000)}

=== CANDIDATE RESUME ===
${(resumeText || "").slice(0, 4000)}

=== TARGET ROLE ===
${targetRole || "SDE"}

=== COVER LETTER ARCHITECTURE ===

PARAGRAPH 1 — HOOK (2-3 sentences):
- Open with something specific about the company (product, mission, recent news, tech blog post)
- Connect it to why this specific role matters to you
- NEVER start the first word with "I"
- Show you researched the company, don't just name-drop

PARAGRAPH 2 — PRIMARY ACHIEVEMENT (3-4 sentences):
- Lead with your most relevant technical achievement that matches the JD
- Include exact metrics from your resume (e.g., "100+ TPS", "83% reduction", "$120K savings")
- Explain the impact, not just what you did
- Connect directly to a requirement in the JD

PARAGRAPH 3 — VERSATILITY (3-4 sentences):
- Second achievement or project showing a different skill dimension
- If JD is backend-heavy, show a fullstack or ML project here
- If JD is ML-heavy, show a systems/infra achievement here
- Again, include real metrics

PARAGRAPH 4 — CLOSE (2-3 sentences):
- State your availability and authorization (if applicable, e.g., "authorized to work via CPT/OPT")
- End with a forward-looking statement about contributing
- Sign off with your name

=== HARD CONSTRAINTS ===
- Total: 250-320 words, 4 paragraphs
- NEVER use: "passionate", "enthusiastic", "I believe", "I feel", "dynamic", "synergy"
- NEVER fabricate metrics — only use numbers from the candidate's resume
- Mirror JD terminology exactly
- Tone: confident and specific, not generic or sycophantic

OUTPUT: Return ONLY the cover letter text. No headers, no "Here is your cover letter", no markdown.`;

    const result = await generateText(prompt, {
      temperature: 0.5,
      systemPrompt: "You write concise, metric-driven cover letters. Output only the letter.",
    });

    return NextResponse.json({ coverLetter: result.text, provider: result.provider });
  } catch (error) {
    return NextResponse.json(
      { error: "Cover letter generation failed", details: String(error) },
      { status: 500 }
    );
  }
}
