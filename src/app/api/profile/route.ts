import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const user = db.prepare(
    "SELECT name, email, background, target_role, target_company, experience, skills, resume_text FROM users LIMIT 1"
  ).get() as Record<string, string> | undefined;

  return NextResponse.json({ profile: user || null });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();

    const existing = db.prepare("SELECT id FROM users LIMIT 1").get() as { id: string } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE users SET name=?, email=?, background=?, target_role=?, target_company=?, experience=?, skills=?, resume_text=?, updated_at=datetime('now') WHERE id=?`
      ).run(
        body.name || "",
        body.email || "",
        body.background || "",
        body.target_role || "",
        body.target_company || "",
        body.experience || "",
        body.skills || "",
        body.resume_text || "",
        existing.id
      );
    } else {
      const { v4: uuidv4 } = await import("uuid");
      db.prepare(
        `INSERT INTO users (id, name, email, background, target_role, target_company, experience, skills, resume_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(),
        body.name || "",
        body.email || body.name ? `${(body.name || "user").toLowerCase().replace(/\s+/g, "")}@local` : "user@local",
        body.background || "",
        body.target_role || "",
        body.target_company || "",
        body.experience || "",
        body.skills || "",
        body.resume_text || ""
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
