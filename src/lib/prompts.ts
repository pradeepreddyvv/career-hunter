const PREAMBLE = `You are a precision career-document generator for a specific candidate.

INPUTS
- MASTER_RESUME: Full career context — work experience, projects, metrics, skills.
- JOB_DESCRIPTION: Target job posting.
- OPTIONAL: COMPANY_RESEARCH, USER_PROFILE.

RULES
1. Use ONLY facts from the supplied inputs. Never invent metrics, projects, tools, publications, or dates.
2. If information is missing, say so — do not guess.
3. Mirror JD terminology when truthful. Do not force keywords unsupported by evidence.
4. One-page resume for internships unless told otherwise.
5. Present tense for current roles, past tense for completed roles.
6. Do not reveal chain-of-thought. Return only the requested output.
7. Keep every bullet within 2 resume lines.`;

const PROMPTS = {
  resume: `TASK: Generate a tailored ATS-optimized resume.

STEP 1 — CLASSIFY ROLE
Pick one: Backend/Platform | Full Stack | Data/Analytics | AI/LLM | ML/CV/Research | General SDE

STEP 2 — EXTRACT FROM JD
- Top 8 must-have keywords
- Top 5 nice-to-have keywords
- Primary responsibilities
- Screening signals

STEP 3 — SELECT BULLETS
- Pick 5-7 work bullets that best match the JD
- Pick 1-2 projects (2-3 bullets each) that best match the JD
- Pick only skills that appear in JD or are directly supporting
- Prioritize bullets with quantifiable metrics (latency, TPS, cost savings, percentages)

STEP 4 — REFINE
- Mirror JD language where truthful
- Vary action verbs (Architected, Designed, Built, Developed, Implemented, Optimized, Diagnosed)
- Keep each bullet <= 2 resume lines
- Do not overload skills — only JD-relevant ones

STEP 5 — ASSEMBLE
Section order: EDUCATION -> SKILLS -> EXPERIENCE -> PROJECTS -> PUBLICATIONS/ACHIEVEMENTS
One page. No objective statement. Plain text, ATS-parseable.

OUTPUT — valid JSON:
{
  "role_category": "",
  "must_have_keywords": [],
  "nice_to_have_keywords": [],
  "selected_bullets": {"experience": [], "projects": []},
  "skills_kept": [],
  "tailoring_notes": [],
  "tailored_resume": ""
}`,

  cover_letter: `TASK: Write a tailored cover letter.

TARGET: 250-320 words, 4 paragraphs.

PARA 1 — HOOK
- One specific detail from COMPANY_RESEARCH or JD (product, team, mission, recent launch).
- Do NOT start with "I". Do NOT fabricate news.

PARA 2 — STRONGEST EXPERIENCE MATCH
- Lead with the single best-matching metric/achievement from the resume.
- Connect it directly to what the role needs.
- Use exact numbers from the resume.

PARA 3 — PROJECT OR DIFFERENTIATOR
- Best-aligned project or publication.
- Show technical depth relevant to the role.

PARA 4 — CLOSE
- Express fit confidently.
- If applicable: "I am authorized to work in the U.S. via CPT/OPT for internships."
- Direct, not pushy.

RULES
- No "passionate", "enthusiastic", "motivated"
- Sound like an engineer, not a template
- One strong story > many weak ones
- Only use verified facts and metrics

OUTPUT — valid JSON:
{
  "hook_strategy": "",
  "experience_lead": "",
  "project_used": "",
  "cover_letter": ""
}`,

  outreach: `TASK: Generate outreach messages for this job application.

GENERATE 4 MESSAGES:

1. LinkedIn connection note — 300 char HARD limit. Mention shared context (school, company, role) if true.
2. LinkedIn DM / InMail — 500 char max. One specific technical detail, one ask.
3. Cold email — subject + body, 150-200 words. Company-specific hook, not mass-outreach tone.
4. Referral ask — 100-150 words. Include [JOB_LINK_PLACEHOLDER].

RULES
- If a contact name is provided, personalize with their name/role.
- If no contact exists, do not invent any.
- No excessive flattery. No desperation.
- Sound like a peer, not a stranger.

OUTPUT — valid JSON:
{
  "linkedin_note": "",
  "linkedin_dm": "",
  "cold_email": {"subject": "", "body": ""},
  "referral_ask": ""
}`,

  ats_audit: `TASK: Audit the generated resume for ATS optimization and recruiter quality.

CHECKS
1. Extract top 20 keywords from JD
2. Check which appear in GENERATED_RESUME
3. Calculate keyword coverage %
4. Flag unsupported claims (metrics/tools not in MASTER_RESUME)
5. Flag repeated action verbs
6. Check role emphasis (does the resume lead with what the JD prioritizes?)

OUTPUT — valid JSON:
{
  "keyword_coverage_pct": 0,
  "matched_keywords": [],
  "missing_keywords": [
    {"keyword": "", "where_to_add": "", "suggested_phrase": ""}
  ],
  "unsupported_claims": [],
  "verb_repetitions": [],
  "role_emphasis_issues": [],
  "top_5_fixes": [],
  "overall_score": 0,
  "recommendation": ""
}`,

  job_scoring: `TASK: Score how well this job matches the candidate.

SCORING — 4 dimensions, each 0-25:
1. Role alignment — does the role match candidate's experience and goals?
2. Technical alignment — how many JD skills does the candidate have?
3. Evidence strength — can the candidate back claims with specific metrics?
4. Practical fit — location, visa, level, timeline compatibility?

overall_score = sum of all 4

SPECIAL RULES
- Visa: "must be authorized" or "cannot sponsor" is fine — CPT/OPT counts. Hard fail only for "US citizen required" or "security clearance required".
- Internship level mismatch (e.g., senior role) -> penalize practical_fit.

OUTPUT — valid JSON:
{
  "overall_score": 0,
  "dimension_scores": {
    "role_alignment": 0,
    "technical_alignment": 0,
    "evidence_strength": 0,
    "practical_fit": 0
  },
  "top_matching_signals": [],
  "top_gaps": [],
  "ats_keywords": [],
  "recommendation": "strong_apply | apply | apply_selectively | skip",
  "apply_rationale": ""
}`,

  company_research: `TASK: Research the company for application personalization.

GOAL: Find what the company values that is NOT obvious from the JD alone.

RESEARCH THESE
1. Product or platform focus relevant to this role
2. Engineering stack, architecture patterns, or technical philosophy
3. Recent launches, acquisitions, or priorities (2025-2026)
4. Cultural values or leadership principles that influence hiring
5. Repeated keywords from their other job postings
6. Internal terminology or team-specific language

RULES
- Separate confirmed facts from inferences
- Do not fabricate tech stack or news
- Only include signals useful for resume, cover letter, or outreach
- Skip low-signal trivia

OUTPUT — valid JSON:
{
  "confirmed_signals": {
    "product_focus": [],
    "engineering_keywords": [],
    "team_themes": [],
    "culture_signals": [],
    "recent_updates": []
  },
  "inferences": [],
  "resume_keywords": [],
  "cover_letter_hooks": [],
  "outreach_hooks": []
}`,

  interview_prep: `TASK: Generate interview preparation for this specific role.

GENERATE:

1. BEHAVIORAL QUESTIONS (5)
- Map each to a real experience from the candidate's resume
- Provide situation/task/action/result outline
- Use actual metrics from the resume

2. TECHNICAL QUESTIONS (5)
- Based on JD tech stack
- Include what they are testing + candidate talking points

3. COMPANY TALKING POINTS (3-4)
- From COMPANY_RESEARCH or JD signals

4. QUESTIONS TO ASK INTERVIEWER (3)
- Role-specific, not generic

5. KEY THEMES (3-5)
- What to emphasize consistently across all answers

RULES
- Ground ALL behavioral prep in real evidence from the resume
- Do not invent stories
- Keep answer outlines concise and memorable

OUTPUT — valid JSON:
{
  "behavioral": [{"question": "", "story_source": "", "star": {"situation": "", "task": "", "action": "", "result": ""}}],
  "technical": [{"question": "", "testing": "", "points": []}],
  "talking_points": [],
  "questions_to_ask": [],
  "key_themes": []
}`,
} as const;

function section(title: string, body: string | undefined | null): string {
  const trimmed = (body || "").trim();
  if (!trimmed) return "";
  return `\n\n=== ${title} ===\n${trimmed}`;
}

export function buildResumePrompt(opts: {
  jobTitle: string;
  company: string;
  jobDescription: string;
  resumeText: string;
  targetRole?: string;
  companyResearch?: string;
}): string {
  return (
    PREAMBLE +
    "\n\n" +
    PROMPTS.resume +
    section("JOB_DESCRIPTION", [
      `Title: ${opts.jobTitle}`,
      `Company: ${opts.company}`,
      `Role Category: ${opts.targetRole || "SDE"}`,
      opts.jobDescription,
    ].join("\n")) +
    section("MASTER_RESUME", opts.resumeText) +
    section("COMPANY_RESEARCH", opts.companyResearch)
  );
}

export function buildCoverLetterPrompt(opts: {
  jobTitle: string;
  company: string;
  jobDescription: string;
  resumeText?: string;
  targetRole?: string;
  companyResearch?: string;
}): string {
  return (
    PREAMBLE +
    "\n\n" +
    PROMPTS.cover_letter +
    section("JOB_DESCRIPTION", [
      `Title: ${opts.jobTitle}`,
      `Company: ${opts.company}`,
      `Role Category: ${opts.targetRole || "SDE"}`,
      opts.jobDescription,
    ].join("\n")) +
    section("MASTER_RESUME", opts.resumeText) +
    section("COMPANY_RESEARCH", opts.companyResearch)
  );
}

export function buildOutreachPrompt(opts: {
  jobTitle: string;
  company: string;
  jobDescription?: string;
  resumeText?: string;
  contactName?: string;
  contactRole?: string;
}): string {
  return (
    PREAMBLE +
    "\n\n" +
    PROMPTS.outreach +
    section("JOB_DETAILS", [
      `Title: ${opts.jobTitle || "Software Engineer"}`,
      `Company: ${opts.company}`,
      opts.contactName ? `Contact: ${opts.contactName} (${opts.contactRole || "unknown role"})` : "",
    ].filter(Boolean).join("\n")) +
    section("JOB_DESCRIPTION", opts.jobDescription?.slice(0, 2000)) +
    section("MASTER_RESUME", opts.resumeText?.slice(0, 2000))
  );
}

export function buildATSAuditPrompt(opts: {
  jobDescription: string;
  generatedResume: string;
  masterResume?: string;
}): string {
  return (
    PREAMBLE +
    "\n\n" +
    PROMPTS.ats_audit +
    section("JOB_DESCRIPTION", opts.jobDescription) +
    section("GENERATED_RESUME", opts.generatedResume) +
    section("MASTER_RESUME", opts.masterResume)
  );
}

export function buildJobScoringPrompt(opts: {
  jobTitle: string;
  company: string;
  jobDescription: string;
  userProfile?: string;
}): string {
  return (
    PREAMBLE +
    "\n\n" +
    PROMPTS.job_scoring +
    section("JOB_DESCRIPTION", [
      `Title: ${opts.jobTitle || "Unknown"}`,
      `Company: ${opts.company || "Unknown"}`,
      opts.jobDescription,
    ].join("\n")) +
    section("CANDIDATE_PROFILE", opts.userProfile || "No profile provided — score based on general SWE intern fit")
  );
}

export function buildCompanyResearchPrompt(opts: {
  company: string;
  jobTitle: string;
  jobDescription: string;
}): string {
  return (
    PREAMBLE +
    "\n\n" +
    PROMPTS.company_research +
    section("COMPANY", opts.company) +
    section("ROLE_TITLE", opts.jobTitle) +
    section("JOB_DESCRIPTION", opts.jobDescription?.slice(0, 3000))
  );
}

export function buildInterviewPrepPrompt(opts: {
  jobTitle: string;
  company: string;
  jobDescription: string;
  resumeText?: string;
  companyResearch?: string;
}): string {
  return (
    PREAMBLE +
    "\n\n" +
    PROMPTS.interview_prep +
    section("JOB_DESCRIPTION", [
      `Title: ${opts.jobTitle}`,
      `Company: ${opts.company}`,
      opts.jobDescription,
    ].join("\n")) +
    section("MASTER_RESUME", opts.resumeText) +
    section("COMPANY_RESEARCH", opts.companyResearch)
  );
}
