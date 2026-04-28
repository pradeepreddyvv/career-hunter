import { NextRequest, NextResponse } from "next/server";
import { getDb, getDefaultUserId } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const { jobId, jobTitle, company, url } = await request.json();
    const db = getDb();

    let actualJobId = jobId;
    if (!actualJobId) {
      actualJobId = uuidv4();
      db.prepare(
        "INSERT OR IGNORE INTO jobs (id, title, company, url, source) VALUES (?, ?, ?, ?, 'manual')"
      ).run(actualJobId, jobTitle || "Untitled", company || "Unknown", url || "");
    }

    const existing = db.prepare(
      "SELECT id FROM applications WHERE job_id = ?"
    ).get(actualJobId) as { id: string } | undefined;

    if (existing) {
      return NextResponse.json({ id: existing.id, status: "already_saved" });
    }

    const id = uuidv4();
    db.prepare(
      "INSERT INTO applications (id, user_id, job_id, status, updated_at) VALUES (?, ?, ?, 'new', datetime('now'))"
    ).run(id, getDefaultUserId(), actualJobId);

    return NextResponse.json({ id, status: "saved" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
