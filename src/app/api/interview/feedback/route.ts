import { NextRequest } from "next/server";
import { generateStream, generateJSON } from "@/lib/ai";
import { createSSEStream } from "@/lib/stream";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { FeedbackResult, SessionSummary, SSEEvent } from "@/types/interview";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action || "score";

  if (action === "summary") return handleSummary(body);
  if (action === "follow_up") return handleFollowUp(body);
  if (action === "score") return handleScore(body);

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

function handleScore(body: {
  question: string;
  answer: string;
  sessionId?: string;
  company?: string;
  targetRole?: string;
  lp?: string;
  stream?: boolean;
}) {
  const { question, answer, sessionId, company, targetRole, lp } = body;

  if (!question || !answer) {
    return Response.json({ error: "question and answer are required" }, { status: 400 });
  }

  const prompt = buildScoringPrompt(question, answer, company, targetRole, lp);

  if (body.stream === false) {
    return handleNonStreamingScore(prompt, question, answer, sessionId, lp);
  }

  return createSSEStream(async (send: (event: SSEEvent) => void) => {
    send({ type: "thinking" });

    let fullText = "";
    for await (const chunk of generateStream(prompt, {
      temperature: 0.3,
      systemPrompt: SCORING_SYSTEM_PROMPT,
    })) {
      fullText += chunk;
      send({ type: "token", data: chunk });
    }

    const feedback = parseJSON<FeedbackResult>(fullText);

    if (sessionId && feedback) {
      saveAnswer(sessionId, question, answer, feedback, lp);
    }

    send({ type: "done", data: JSON.stringify(feedback || { raw: fullText }) });
  });
}

async function handleNonStreamingScore(
  prompt: string,
  question: string,
  answer: string,
  sessionId?: string,
  lp?: string,
) {
  try {
    const feedback = await generateJSON<FeedbackResult>(prompt, {
      temperature: 0.3,
      systemPrompt: SCORING_SYSTEM_PROMPT,
    });

    if (sessionId) {
      saveAnswer(sessionId, question, answer, feedback, lp);
    }

    return Response.json(feedback);
  } catch (error) {
    return Response.json(
      { error: "Feedback generation failed", details: String(error) },
      { status: 500 }
    );
  }
}

function handleFollowUp(body: {
  question: string;
  answer: string;
  feedback: FeedbackResult;
  company?: string;
  lp?: string;
}) {
  const { question, answer, feedback, company, lp } = body;

  const prompt = `Based on this interview exchange, generate ONE targeted follow-up question.

ORIGINAL QUESTION: ${question}
${lp ? `LEADERSHIP PRINCIPLE: ${lp}` : ""}
${company ? `COMPANY: ${company}` : ""}
CANDIDATE'S ANSWER: ${answer}
SCORE: ${feedback.overallScore}/100
WEAK AREAS: ${feedback.weakAreas.join(", ")}

Generate a follow-up that probes deeper into the weakest part of their answer.
Return JSON: { "followUpQuestion": "<question>", "reason": "<why this probes a gap>" }`;

  return createSSEStream(async (send: (event: SSEEvent) => void) => {
    send({ type: "thinking" });

    let fullText = "";
    for await (const chunk of generateStream(prompt, { temperature: 0.4 })) {
      fullText += chunk;
      send({ type: "token", data: chunk });
    }

    const result = parseJSON<{ followUpQuestion: string; reason: string }>(fullText);
    send({ type: "done", data: JSON.stringify(result || { raw: fullText }) });
  });
}

function handleSummary(body: { sessionId: string; company?: string }) {
  const { sessionId, company } = body;

  if (!sessionId) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }

  const db = getDb();
  const answers = db
    .prepare("SELECT * FROM answers WHERE session_id = ? ORDER BY created_at ASC")
    .all(sessionId) as {
      question_text: string;
      question_lp: string;
      answer_text: string;
      feedback: string;
      score: number;
    }[];

  if (answers.length === 0) {
    return Response.json({ error: "No answers found for this session" }, { status: 404 });
  }

  const answersContext = answers
    .map((a, i) => {
      const fb = JSON.parse(a.feedback || "{}");
      return `Q${i + 1} [${a.question_lp || "General"}]: ${a.question_text}
Answer: ${a.answer_text.slice(0, 500)}
Score: ${fb.overallScore || a.score}/100`;
    })
    .join("\n\n");

  const prompt = `Analyze this complete interview session and provide a summary.

${company ? `COMPANY: ${company}` : ""}
SESSION (${answers.length} questions):

${answersContext}

Return JSON:
{
  "sessionScore": <0-100 overall>,
  "readiness": <0-100 interview readiness>,
  "hiringSignal": "<Strong Hire | Hire | Lean Hire | Lean No Hire | No Hire>",
  "perQuestion": [{ "lp": "<principle>", "score": <0-100>, "oneLiner": "<one sentence>" }],
  "strengths": ["<pattern 1>", "<pattern 2>"],
  "weaknesses": ["<pattern 1>", "<pattern 2>"],
  "priorities": [{ "area": "<weak area>", "drill": "<specific practice suggestion>" }],
  "encouragement": "<motivational closing>"
}`;

  return createSSEStream(async (send: (event: SSEEvent) => void) => {
    send({ type: "thinking" });

    let fullText = "";
    for await (const chunk of generateStream(prompt, {
      temperature: 0.3,
      systemPrompt: "You are an expert interview coach providing session summaries. Return valid JSON only.",
    })) {
      fullText += chunk;
      send({ type: "token", data: chunk });
    }

    const summary = parseJSON<SessionSummary>(fullText);

    if (summary) {
      db.prepare(
        "UPDATE sessions SET completed_at = datetime('now'), avg_score = ?, summary = ? WHERE id = ?"
      ).run(summary.sessionScore, JSON.stringify(summary), sessionId);

      if (summary.weaknesses.length > 0) {
        updateWeakAreas(db, sessionId, summary);
      }
    }

    send({ type: "done", data: JSON.stringify(summary || { raw: fullText }) });
  });
}

function saveAnswer(
  sessionId: string,
  question: string,
  answer: string,
  feedback: FeedbackResult,
  lp?: string,
) {
  const db = getDb();
  db.prepare(
    `INSERT INTO answers (id, session_id, question_text, question_lp, answer_text, feedback, score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    uuidv4(),
    sessionId,
    question,
    lp || "",
    answer,
    JSON.stringify(feedback),
    feedback.overallScore
  );

  const answerCount = (
    db.prepare("SELECT COUNT(*) as c FROM answers WHERE session_id = ?").get(sessionId) as { c: number }
  ).c;
  const avgScore = (
    db.prepare("SELECT AVG(score) as avg FROM answers WHERE session_id = ?").get(sessionId) as { avg: number }
  ).avg;

  db.prepare("UPDATE sessions SET question_count = ?, avg_score = ? WHERE id = ?").run(
    answerCount,
    Math.round(avgScore),
    sessionId
  );
}

function updateWeakAreas(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  summary: SessionSummary
) {
  const session = db.prepare("SELECT user_id FROM sessions WHERE id = ?").get(sessionId) as { user_id: string } | undefined;
  if (!session) return;

  for (const weakness of summary.weaknesses) {
    const existing = db
      .prepare("SELECT * FROM weak_areas WHERE user_id = ? AND area = ?")
      .get(session.user_id, weakness) as { id: string; score_history: string; total_occurrences: number } | undefined;

    if (existing) {
      const history = JSON.parse(existing.score_history || "[]");
      history.push(summary.sessionScore);
      if (history.length > 20) history.shift();
      const avg = history.reduce((a: number, b: number) => a + b, 0) / history.length;
      const trend =
        summary.sessionScore > avg + 5
          ? "improving"
          : summary.sessionScore < avg - 5
            ? "declining"
            : "stable";

      db.prepare(
        "UPDATE weak_areas SET total_occurrences = ?, score_history = ?, avg_score = ?, trend = ?, last_seen = datetime('now') WHERE id = ?"
      ).run(existing.total_occurrences + 1, JSON.stringify(history), avg, trend, existing.id);
    } else {
      db.prepare(
        "INSERT INTO weak_areas (id, user_id, area, total_occurrences, score_history, avg_score, trend, last_seen) VALUES (?, ?, ?, 1, ?, ?, 'stable', datetime('now'))"
      ).run(uuidv4(), session.user_id, weakness, JSON.stringify([summary.sessionScore]), summary.sessionScore);
    }
  }
}

function parseJSON<T>(text: string): T | null {
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

const SCORING_SYSTEM_PROMPT = `You are an expert behavioral interview coach. Score answers on a 0-100 scale with granular feedback. Return valid JSON only.`;

function buildScoringPrompt(
  question: string,
  answer: string,
  company?: string,
  targetRole?: string,
  lp?: string,
): string {
  return `Score this behavioral interview answer.

QUESTION: ${question}
${lp ? `LEADERSHIP PRINCIPLE: ${lp}` : ""}
${company ? `COMPANY: ${company}` : ""}
${targetRole ? `TARGET ROLE: ${targetRole}` : ""}

CANDIDATE'S ANSWER:
${answer}

Score each dimension 0-100. Be calibrated: 90+ is exceptional, 70-89 is solid, 50-69 needs work, below 50 is poor.

Analyze delivery: count filler words (um, uh, like, you know, basically, actually, so), hedging phrases (I think, maybe, kind of, sort of, I guess), and power words (built, led, shipped, reduced, achieved, created, designed, architected).

Return JSON:
{
  "overallScore": <0-100>,
  "star": {
    "situation": <0-100>,
    "task": <0-100>,
    "action": <0-100>,
    "result": <0-100>
  },
  "dimensions": {
    "clarity": <0-100>,
    "confidence": <0-100>,
    "conciseness": <0-100>,
    "storytelling": <0-100>,
    "technicalDepth": <0-100>
  },
  "lpAlignment": <0-100>,
  "delivery": {
    "fillerWords": <count>,
    "hedgingPhrases": <count>,
    "powerWords": <count>,
    "pacing": "<too_short|good|too_long>"
  },
  "strengths": ["<specific strength>", "<specific strength>"],
  "improvements": ["<actionable improvement>", "<actionable improvement>"],
  "coachingTip": "<one paragraph of specific coaching advice>",
  "idealStructure": "<how a strong answer would be structured in 2-3 sentences>",
  "weakAreas": ["<area needing practice>"],
  "recommendation": "<Strong|Good|Needs Work|Redo>",
  "followUpQuestion": "<a probing follow-up question>"
}`;
}
