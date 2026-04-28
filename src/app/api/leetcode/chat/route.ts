import { NextRequest } from "next/server";
import { createSSEStream } from "@/lib/stream";
import { generateStream } from "@/lib/ai";

const PERSONAS: Record<string, string> = {
  interviewer: `You are a senior tech interviewer at a FAANG company. Your job is to guide the candidate through the problem like a real interview — give hints when stuck, ask probing questions about their approach, time complexity, and edge cases. Never give the full answer. Push them to think out loud. If they're on the right track, say so. If they're off, redirect with a question, not an answer.`,
  teacher: `You are a patient CS professor. Explain concepts clearly, use analogies, and break problems into smaller parts. When reviewing code, explain WHY certain approaches work, not just WHAT to do. Reference relevant data structures and algorithms by name. If the student's approach works but isn't optimal, explain the tradeoff before suggesting improvements.`,
  neetcode: `You are a concise coding tutorial creator (think NeetCode style). Give clean, pattern-based explanations. Identify which problem pattern this belongs to (sliding window, two pointers, BFS/DFS, DP, etc.). Show the optimal approach step by step with clear reasoning. Include time and space complexity. Keep it short and practical — no fluff.`,
};

export async function POST(request: NextRequest) {
  const { code, problem, message, persona, history } = await request.json();

  const personaPrompt = PERSONAS[persona] || PERSONAS.interviewer;
  const historyText = (history || [])
    .slice(-6)
    .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
    .join("\n");

  const prompt = `${problem ? `PROBLEM: ${typeof problem === "string" ? problem : JSON.stringify(problem)}\n\n` : ""}${code ? `CURRENT CODE:\n\`\`\`\n${code}\n\`\`\`\n\n` : ""}${historyText ? `CONVERSATION:\n${historyText}\n\n` : ""}USER: ${message}`;

  return createSSEStream(async (send) => {
    send({ type: "thinking" });
    let fullText = "";
    for await (const chunk of generateStream(prompt, {
      temperature: 0.5,
      systemPrompt: personaPrompt,
    })) {
      fullText += chunk;
      send({ type: "token", data: chunk });
    }
    send({ type: "done", data: fullText });
  });
}
