import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/ai";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "generate_session") return handleGenerateSession(body);
    if (action === "analyze_progress") return handleAnalyzeProgress(body);

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

async function handleGenerateSession(body: {
  company: string;
  role: string;
  weakAreas?: string[];
  completedQuestions?: string[];
  sessionNumber?: number;
  userProfile?: string;
}) {
  const { company, role, weakAreas, completedQuestions, sessionNumber, userProfile } = body;

  const db = getDb();
  const dbWeakAreas = db.prepare(
    "SELECT area, avg_score, trend FROM weak_areas ORDER BY avg_score ASC LIMIT 5"
  ).all() as { area: string; avg_score: number; trend: string }[];

  const allWeak = [...(weakAreas || []), ...dbWeakAreas.map(w => `${w.area} (avg: ${w.avg_score}, ${w.trend})`)];

  const prompt = `Generate a personalized interview practice session.

COMPANY: ${company || "General"}
ROLE: ${role || "Software Engineer"}
SESSION NUMBER: ${sessionNumber || 1}

${userProfile ? `CANDIDATE PROFILE:\n${userProfile}\n` : ""}

${allWeak.length > 0 ? `WEAK AREAS TO TARGET (prioritize these):\n${allWeak.map((w, i) => `${i + 1}. ${w}`).join("\n")}\n` : ""}

${completedQuestions?.length ? `ALREADY ASKED (avoid repeating):\n${completedQuestions.slice(-20).join("\n")}\n` : ""}

Generate 5 questions that:
1. Target the candidate's weak areas first
2. Mix behavioral and technical based on the role
3. Increase difficulty if session number > 2
4. Include company-specific context when possible
5. Each question should probe a different skill

Return JSON:
{
  "questions": [
    {
      "text": "",
      "category": "behavioral | technical | system_design",
      "lp": "Leadership Principle if applicable, else empty",
      "difficulty": "easy | medium | hard",
      "targets_weakness": "which weak area this targets, or empty",
      "follow_ups": ["probe 1", "probe 2"],
      "what_good_looks_like": "brief description of a strong answer"
    }
  ],
  "session_theme": "brief description of what this session focuses on",
  "difficulty_level": "easy | medium | hard"
}`;

  const session = await generateJSON(prompt, { temperature: 0.5 });
  return NextResponse.json({ session });
}

async function handleAnalyzeProgress(body: {
  sessions?: { score: number; weakAreas: string[] }[];
}) {
  const db = getDb();

  const weakAreas = db.prepare(
    "SELECT area, avg_score, total_occurrences, trend FROM weak_areas ORDER BY total_occurrences DESC LIMIT 10"
  ).all() as { area: string; avg_score: number; total_occurrences: number; trend: string }[];

  const recentSessions = db.prepare(
    "SELECT company, role, avg_score, created_at FROM sessions ORDER BY created_at DESC LIMIT 10"
  ).all() as { company: string; role: string; avg_score: number; created_at: string }[];

  const prompt = `Analyze this candidate's interview practice progress.

WEAK AREAS (from all sessions):
${weakAreas.map(w => `- ${w.area}: avg ${w.avg_score}/100, seen ${w.total_occurrences}x, trend: ${w.trend}`).join("\n") || "No data yet"}

RECENT SESSIONS:
${recentSessions.map(s => `- ${s.company} ${s.role}: ${s.avg_score}/100 (${s.created_at})`).join("\n") || "No sessions yet"}

${body.sessions?.length ? `ADDITIONAL SESSION DATA:\n${JSON.stringify(body.sessions)}\n` : ""}

Return JSON:
{
  "overall_readiness": 0,
  "trend": "improving | stable | declining",
  "strongest_areas": [""],
  "weakest_areas": [""],
  "priority_drills": [{"area": "", "suggestion": "", "estimated_sessions": 0}],
  "encouragement": "",
  "next_session_focus": ""
}`;

  const analysis = await generateJSON(prompt, { temperature: 0.3 });
  return NextResponse.json({ analysis });
}
