from __future__ import annotations

"""Generic prompt templates for document generation.

Every template is a plain format-string with zero personal data baked in.
User-specific context (vault, connections, etc.) is injected at call time
via :func:`build_generation_prompt`.
"""

from typing import Any, Dict

PROMPT_PACK: Dict[str, str] = {
    # ── Resume (ATS plain-text) ──────────────────────────────────────────
    "resume": """\
You are a world-class ATS resume optimization expert. Generate a tailored, \
one-page resume.

INPUTS PROVIDED:
- MASTER_VAULT: Candidate's full career context
- JOB_DESCRIPTION: Target position
- COMPANY_RESEARCH: Hidden keywords and company context (if available)
- ROLE_CATEGORY: {role_category}

RULES:
1. Use ONLY facts from the MASTER_VAULT. Never invent metrics, projects, \
tools, or dates.
2. Mirror JD terminology where truthful.
3. One page maximum.
4. Format: Education -> Skills -> Experience -> Projects
5. Include exact metrics from vault (percentages, TPS, cost savings, etc.)
6. Select bullets and projects most relevant to the role category.
7. Skills section: 2 categories only -- Languages and Technologies.
8. No Objective section. No PES GPA if present in vault.

Return JSON:
{{
  "resume_text": "<full plain-text resume>",
  "selected_bullets": ["<bullet IDs used>"],
  "selected_projects": ["<project names used>"],
  "keyword_coverage": ["<JD keywords covered>"]
}}
""",

    # ── Cover Letter ─────────────────────────────────────────────────────
    "cover_letter": """\
You are a top career strategist with a 78% interview conversion rate.
Write a 4-paragraph cover letter (250-320 words max).

INPUTS PROVIDED:
- MASTER_VAULT: Candidate's full career context
- JOB_DESCRIPTION: Target position
- COMPANY_RESEARCH: Company context (if available)
- ROLE_CATEGORY: {role_category}

RULES:
1. Never start with "I".
2. Company-specific hook in paragraph 1.
3. Use exact metrics from vault -- never invent numbers.
4. Include visa/authorization status in closing paragraph if provided in vault.
5. Never use "passionate" or "enthusiastic".
6. Mirror JD language naturally.
7. 250-320 words maximum.

Return JSON:
{{
  "cover_letter": "<full cover letter text>",
  "word_count": <integer>,
  "hooks_used": ["<company-specific hooks referenced>"]
}}
""",

    # ── Outreach Messages ────────────────────────────────────────────────
    "outreach": """\
Generate 3 professional outreach messages for job networking.

INPUTS PROVIDED:
- MASTER_VAULT: Candidate context
- JOB_DESCRIPTION: Target position
- CONNECTIONS_AT_COMPANY: Known contacts (if any)

RULES:
1. If connections exist at the company, personalize messages to reference them.
2. Keep messages concise and professional.
3. Include a clear ask in each message.

Return JSON:
{{
  "linkedin_message": "<300 char max connection request or 500 char DM>",
  "cold_email": {{
    "subject": "<email subject line>",
    "body": "<150-200 words email body>"
  }},
  "referral_ask": "<100-150 words, includes [JOB_LINK_PLACEHOLDER]>"
}}
""",

    # ── Interview Prep ───────────────────────────────────────────────────
    "interview_prep": """\
Generate interview preparation materials for this position.

INPUTS PROVIDED:
- MASTER_VAULT: Candidate context with STAR stories
- JOB_DESCRIPTION: Target position
- ROLE_CATEGORY: {role_category}

Map behavioral questions to the candidate's existing STAR stories where \
possible. Technical questions should be based on the JD tech stack.

Return JSON:
{{
  "behavioral_questions": [
    {{"question": "...", "star_story": "STAR-N or custom", "talking_points": ["..."]}}
  ],
  "technical_questions": [
    {{"question": "...", "answer_framework": "...", "key_concepts": ["..."]}}
  ],
  "talking_points": ["<3-4 company-specific talking points>"],
  "questions_to_ask": ["<3 thoughtful questions for the interviewer>"],
  "key_themes": ["<3-5 themes to emphasize>"]
}}
""",

    # ── Company Research ─────────────────────────────────────────────────
    "company_research": """\
You are a job application strategist. Research this company and extract \
hidden priorities that a candidate should weave into their resume -- \
keywords and themes NOT explicitly in the job description but that the \
company clearly values.

RESEARCH AREAS:
1. Company's recent engineering blog posts, tech talks, or press releases
2. Company's tech stack and architectural philosophy
3. Company's cultural values and leadership principles
4. Recent product launches, acquisitions, or strategic pivots
5. Common themes in their other job postings
6. Industry-specific terminology they use internally

Return your findings in this format:
HIDDEN_KEYWORDS: [keywords not in JD but company values]
TECH_CONTEXT: [tech stack insights]
CULTURE_SIGNALS: [culture and values]
RECENT_NEWS: [recent company developments]
TEAM_CONTEXT: [team and role context]
""",

    # ── ATS Audit ────────────────────────────────────────────────────────
    "ats_audit": """\
Audit this resume against the job description for ATS keyword coverage.

INPUTS PROVIDED:
- JOB_DESCRIPTION: Target position
- EXISTING_RESUME: The generated resume to audit

STEPS:
1. Extract top 20 keywords/phrases from the JD.
2. Check which appear (exact or close synonym) in the resume.
3. Calculate coverage percentage.
4. Identify top 5 missing keywords with specific suggestions for inclusion.

Return JSON:
{{
  "keywords_found": ["<keywords present in resume>"],
  "keywords_missing": ["<keywords absent from resume>"],
  "coverage_percent": <integer 0-100>,
  "suggestions": [
    {{"keyword": "...", "suggestion": "<how to naturally include it>"}}
  ],
  "ats_score_prediction": <integer 0-100>
}}
""",

    # ── Multi-Dimensional Score ──────────────────────────────────────────
    "multi_score": """\
Score this job match across multiple dimensions (0-100 each).

INPUTS PROVIDED:
- MASTER_VAULT: Candidate context
- JOB_DESCRIPTION: Target position

Evaluate each dimension independently with specific evidence.

Return JSON:
{{
  "technical_match": {{
    "score": <0-100>,
    "matched_skills": ["..."],
    "missing_skills": ["..."]
  }},
  "experience_relevance": {{
    "score": <0-100>,
    "reasoning": "..."
  }},
  "education_fit": {{
    "score": <0-100>,
    "reasoning": "..."
  }},
  "culture_alignment": {{
    "score": <0-100>,
    "reasoning": "..."
  }},
  "gap_analysis": ["<list of gaps to address>"],
  "overall_score": <0-100>,
  "recommendation": "<STRONG_APPLY | APPLY | MAYBE | SKIP>",
  "cover_letter_emphasis": ["<what to highlight based on gaps>"]
}}
""",

    # ── Follow-Up Templates ──────────────────────────────────────────────
    "follow_up": """\
Generate professional follow-up email templates for this job application.

INPUTS PROVIDED:
- MASTER_VAULT: Candidate context
- JOB_DESCRIPTION: Target position

All messages should reference specific topics from the job description \
and feel personalized, not generic.

Return JSON:
{{
  "post_application_1week": {{
    "subject": "<email subject>",
    "body": "<email body, 100-150 words>"
  }},
  "post_interview_thankyou": {{
    "subject": "<email subject>",
    "body": "<email body, 100-150 words>"
  }},
  "post_interview_followup_1week": {{
    "subject": "<email subject>",
    "body": "<email body, 100-150 words>"
  }}
}}
""",

    # ── Resume LaTeX ─────────────────────────────────────────────────────
    "resume_latex": """\
Generate a LaTeX resume body (from \\begin{{document}} to \\end{{document}}).

INPUTS PROVIDED:
- MASTER_VAULT: Candidate context
- JOB_DESCRIPTION: Target position
- COMPANY_RESEARCH: Company context (if available)
- ROLE_CATEGORY: {role_category}

Use these custom commands (already defined in the preamble):
- \\resumeSubHeading{{title}}{{dates}}{{company}}{{location}}
- \\resumeSubRole{{role}}{{dates}}
- \\resumeItem{{description}}
- \\resumeProjectHeading{{\\textbf{{name}} $|$ \\emph{{tech stack}}}}{{{dates}}}
- \\ExternalLink{{url}}{{display text}}
- \\resumeSubHeadingListStart / \\resumeSubHeadingListEnd
- \\resumeItemListStart / \\resumeItemListEnd

Section structure: Education -> Skills -> Experience -> Projects

For multi-role experience at the same company, use \\resumeSubRole for \
sub-roles under a single \\resumeSubHeading.

Return ONLY the LaTeX body code from \\begin{{document}} to \
\\end{{document}}, nothing else. Do NOT include the preamble.
""",
}

LATEX_PREAMBLE = r"""\documentclass[letterpaper,11pt]{article}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage[usenames,dvipsnames]{color}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{fontawesome5}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{\vspace{-4pt}\scshape\raggedright\large}{}{0em}{}[\color{black}\titlerule\vspace{-5pt}]

\newcommand{\resumeItem}[1]{\item\small{#1 \vspace{-2pt}}}
\newcommand{\resumeSubHeading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}
\newcommand{\resumeSubRole}[2]{
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textit{\small#1} & \textit{\small #2} \\
    \end{tabular*}\vspace{-7pt}
}
\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}
\newcommand{\ExternalLink}[2]{\href{#1}{\underline{#2}}}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}
"""


def build_section(label: str, content: str) -> str:
    """Build a labeled section for prompt injection.

    Args:
        label: Section header (e.g. ``"MASTER_VAULT"``).
        content: Section body text.

    Returns:
        Formatted section string with delimiters.
    """
    separator = "=" * 60
    return f"\n{separator}\n{label}\n{separator}\n{content}\n"


def build_generation_prompt(
    prompt_key: str,
    job: Dict[str, Any],
    user_vault: str,
    role_category: str = "",
    company_research: str = "",
    connections: str = "",
    existing_resume: str = "",
) -> str:
    """Build a complete generation prompt from a template plus context sections.

    Args:
        prompt_key: Key into ``PROMPT_PACK`` (e.g. ``"resume"``,
            ``"cover_letter"``).
        job: Job dict with ``title``, ``company``, ``location``,
            ``description``.
        user_vault: The user's full career vault / profile text.
        role_category: Role classification (e.g. ``"SDE"``, ``"ML/AI"``).
        company_research: Pre-generated company research text.
        connections: Known connections at the company.
        existing_resume: Previously generated resume (for ATS audit).

    Returns:
        Complete prompt string ready for Gemini.

    Raises:
        ValueError: If ``prompt_key`` is not found in ``PROMPT_PACK``.
    """
    template = PROMPT_PACK.get(prompt_key, "")
    if not template:
        raise ValueError(f"Unknown prompt key: {prompt_key}")

    # Format the template with role_category (safe for templates without it)
    try:
        formatted_template = template.format(role_category=role_category)
    except KeyError:
        formatted_template = template

    sections = [formatted_template]

    # Always include user vault
    sections.append(build_section("MASTER_VAULT", user_vault))

    # Always include job description
    title = job.get("title", "N/A")
    company = job.get("company", "N/A")
    location = job.get("location", "N/A")
    description = job.get("description", "No description provided.")

    job_section = (
        f"Title: {title}\n"
        f"Company: {company}\n"
        f"Location: {location}\n\n"
        f"{description}"
    )
    sections.append(build_section("JOB_DESCRIPTION", job_section))

    # Optional sections
    if company_research:
        sections.append(build_section("COMPANY_RESEARCH", company_research))
    if connections:
        sections.append(build_section("CONNECTIONS_AT_COMPANY", connections))
    if existing_resume:
        sections.append(build_section("EXISTING_RESUME", existing_resume))

    return "\n".join(sections)
