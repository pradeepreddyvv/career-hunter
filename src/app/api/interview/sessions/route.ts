import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const answers = (
      db.prepare("SELECT * FROM answers WHERE session_id = ? ORDER BY created_at ASC").all(id) as Record<string, unknown>[]
    ).map((a) => ({
      ...a,
      feedback: a.feedback ? JSON.parse(a.feedback as string) : null,
    }));
    return NextResponse.json({ session, answers });
  }

  const sessions = (
    db.prepare("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 50").all() as Record<string, unknown>[]
  ).map((s) => ({
    ...s,
    weak_areas: s.weak_areas ? JSON.parse(s.weak_areas as string) : [],
    summary: s.summary ? JSON.parse(s.summary as string) : null,
  }));
  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  try {
    const { userId, company, role } = await request.json();
    const db = getDb();
    const id = uuidv4();

    db.prepare(
      `INSERT INTO sessions (id, user_id, company, role) VALUES (?, ?, ?, ?)`
    ).run(id, userId || "anonymous", company || "", role || "");

    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create session", details: String(error) },
      { status: 500 }
    );
  }
}
