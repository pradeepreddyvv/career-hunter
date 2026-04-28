import { NextRequest } from "next/server";
import { generateText, generateJSON } from "@/lib/ai";

type Persona = "bar_raiser" | "grilling" | "friendly";

function getPersonaPrompt(persona: Persona, userName: string): string {
  if (persona === "bar_raiser") {
    return `You are an Amazon Bar Raiser conducting a live interview with ${userName}. You care deeply about Amazon's 16 Leadership Principles. You are sharp but respectful. You probe hard for the candidate's SPECIFIC individual role (not "we"), concrete metrics, and what they learned. You rarely interrupt unless genuinely needed.`;
  }
  if (persona === "grilling") {
    return `You are a tough senior engineer doing a grilling interview with ${userName}. You push back hard on vague answers, demand specifics, and call out fluff. You probe for metrics and depth. You interrupt more often than a typical interviewer, but only when the candidate is drifting, being vague, or technically wrong.`;
  }
  return `You are a friendly but sharp interviewer helping ${userName} bring out their best. You're warm, you nudge gently when they ramble, and you ask follow-ups kindly. You rarely interrupt abruptly.`;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action;

  if (action === "decide") return handleDecide(body);
  if (action === "finish_answer") return handleFinishAnswer(body);
  if (action === "session_summary") return handleSessionSummary(body);

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

function handleDecide(body: {
  transcript: string;
  reason: string;
  persona: Persona;
  userName: string;
  currentQuestion: string;
  currentLP?: string;
  history: { role: string; text: string }[];
}) {
  const { transcript, reason, persona, userName, currentQuestion, currentLP, history } = body;
  const personaPrompt = getPersonaPrompt(persona, userName || "the candidate");

  const hist = (history || [])
    .slice(-8)
    .map((m) => `${m.role === "interviewer" ? "Interviewer" : "Candidate"}: ${m.text}`)
    .join("\n");

  const prompt =
    personaPrompt +
    "\n\nYou are listening in real time as the candidate answers. The transcript below is their IN-PROGRESS answer (may have STT errors). Decide whether to INTERRUPT, ANSWER a direct question they asked, or STAY SILENT and let them keep talking.\n\n" +
    `CURRENT QUESTION YOU ASKED:\n"${currentQuestion}"\n` +
    (currentLP ? `LEADERSHIP PRINCIPLE: ${currentLP}\n` : "") +
    "\n" +
    `RECENT CONVERSATION:\n${hist}\n\n` +
    `CANDIDATE LIVE TRANSCRIPT (in progress):\n"${transcript}"\n\n` +
    `TRIGGER REASON: ${reason}\n\n` +
    "DECISION RULES:\n" +
    "- STAY SILENT (default). Real interviewers rarely interrupt. Silence is the norm.\n" +
    "- INTERRUPT only if: the candidate is rambling off-topic for a while, said something clearly wrong that you must challenge, or has clearly wrapped up a STAR component and a natural probe is needed (e.g. 'what was YOUR specific role there?'). Do NOT interrupt just because they paused.\n" +
    "- ANSWER if the candidate asked you a direct question (e.g. 'can you repeat', 'what do you mean', 'can I assume X'). Give a brief answer and bounce it back.\n\n" +
    "OUTPUT JSON ONLY (no markdown fences, no extra text):\n" +
    '{ "action": "silent" | "interrupt" | "answer", "reason": "short phrase", "message": "plain text 1-3 sentences to say out loud (empty if silent)" }';

  return generateAndRespond(prompt, 0.4);
}

function handleFinishAnswer(body: {
  answer: string;
  persona: Persona;
  userName: string;
  currentQuestion: string;
  currentLP?: string;
}) {
  const { answer, persona, userName, currentQuestion, currentLP } = body;
  const personaPrompt = getPersonaPrompt(persona, userName || "the candidate");

  const prompt =
    personaPrompt +
    "\n\n" +
    `Question you asked: "${currentQuestion}"\n` +
    (currentLP ? `Leadership Principle: ${currentLP}\n` : "") +
    `Candidate's full answer: "${(answer || "").slice(0, 2000)}"\n\n` +
    "Decide: ask ONE sharp probing follow-up, or acknowledge and move on. Output JSON ONLY:\n" +
    '{"action":"followup"|"move_on","message":"plain-text 1-2 sentences to say"}';

  return generateAndRespond(prompt, 0.5);
}

async function handleSessionSummary(body: {
  answers: { question: string; lp?: string; answer: string }[];
  persona: Persona;
  userName: string;
  company: string;
  role: string;
}) {
  const { answers, userName, company, role } = body;

  if (!answers?.length) {
    return Response.json({ error: "No answers to score" }, { status: 400 });
  }

  const transcriptBlock = answers
    .map(
      (a, i) =>
        `Q${i + 1}${a.lp ? ` [${a.lp}]` : ""}: ${a.question}\nA: ${a.answer || "(no answer captured)"}`
    )
    .join("\n\n");

  const prompt =
    `You are a senior interview coach grading a full live interview session.\n\n` +
    `CANDIDATE: ${userName}\n` +
    `COMPANY: ${company}\nROLE: ${role}\n\n` +
    `SESSION:\n${transcriptBlock}\n\n` +
    "Return ONLY valid JSON (no markdown fences):\n" +
    "{\n" +
    '  "overall_score": 0,\n' +
    '  "recommendation": "Strong Hire | Hire | Lean No Hire | No Hire",\n' +
    '  "per_question": [{"question":"","score":0,"strengths":"","gaps":""}],\n' +
    '  "leadership_principles_signal": [{"lp":"","strength":"strong|mixed|weak","evidence":""}],\n' +
    '  "top_strengths": [""],\n' +
    '  "top_improvements": [""],\n' +
    '  "next_actions": [""]\n' +
    "}";

  try {
    const result = await generateText(prompt, { temperature: 0.3 });
    const cleaned = result.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Response.json(parsed);
  } catch {
    return Response.json({ error: "Scoring failed" }, { status: 500 });
  }
}

async function generateAndRespond(prompt: string, temperature: number) {
  try {
    const result = await generateJSON<{ action: string; reason?: string; message: string }>(prompt, {
      temperature,
    });
    return Response.json(result);
  } catch {
    return Response.json({ action: "silent", message: "" });
  }
}
