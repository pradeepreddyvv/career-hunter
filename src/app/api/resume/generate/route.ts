import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const { jobTitle, jobDescription, company, resumeText, targetRole } = await request.json();

    if (!jobDescription || !resumeText) {
      return NextResponse.json(
        { error: "jobDescription and resumeText are required" },
        { status: 400 }
      );
    }

    const prompt = `You are an expert ATS resume optimization specialist. Generate a tailored one-page resume.

=== JOB DETAILS ===
Title: ${jobTitle || "Software Engineer"}
Company: ${company || "Unknown"}
Description:
${jobDescription.slice(0, 4000)}

=== CANDIDATE'S MASTER RESUME ===
${resumeText.slice(0, 5000)}

=== TARGET ROLE ===
${targetRole || "SDE"}

=== RESUME GENERATION RULES ===

STEP 1 — ANALYZE JD:
- Extract every technical keyword, tool, framework, and methodology mentioned
- Identify top 5 must-have skills and top 3 nice-to-have skills
- Note the seniority level and domain (backend, frontend, ML, data, fullstack, etc.)

STEP 2 — SELECT BULLETS:
- Pick ONLY bullets from the candidate's resume that match JD requirements
- Prioritize bullets with quantifiable metrics (latency, TPS, cost savings, percentages)
- For each experience entry, include 3-4 most relevant bullets, not all of them
- If candidate has multiple roles, lead with the one closest to the JD

STEP 3 — OPTIMIZE:
- Mirror JD terminology exactly (if JD says "REST APIs", write "REST APIs" not "RESTful services")
- Keep ALL metrics exactly as stated in the master resume — never fabricate or round numbers
- Start every bullet with a strong action verb (Designed, Built, Reduced, Migrated, Led, Implemented)
- Each bullet: action + what you did + quantifiable impact

STEP 4 — FORMAT:
Section order: Education | Technical Skills | Experience | Projects
- Education: degree, school, GPA (if > 3.5), relevant coursework (max 5)
- Technical Skills: two lines max — Languages: ... | Technologies: ... (only JD-matched skills)
- Experience: reverse chronological, 3-4 bullets each, company + title + dates
- Projects: 2-3 most relevant, with tech stack in parentheses, 2 bullets each
- One page, plain text, ATS-parseable (no tables, columns, graphics, or special formatting)

HARD CONSTRAINTS:
- NEVER add skills, experiences, or projects not in the master resume
- NEVER include an Objective or Summary section
- NEVER list more than 2 skill categories
- Total length: fit on one page (~500-600 words)

OUTPUT: Return ONLY the resume text. No explanations, headers like "Here is your resume", or markdown.`;

    const result = await generateText(prompt, {
      temperature: 0.3,
      systemPrompt: "You are an expert ATS resume writer. Output only the resume content.",
    });

    return NextResponse.json({ resume: result.text, provider: result.provider });
  } catch (error) {
    return NextResponse.json(
      { error: "Resume generation failed", details: String(error) },
      { status: 500 }
    );
  }
}
