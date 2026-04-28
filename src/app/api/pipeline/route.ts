import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  const db = getDb();
  const applications = db
    .prepare(
      `SELECT a.id, a.status, a.applied_at, a.notes, a.updated_at,
              COALESCE(j.title, 'Unknown') as job_title,
              COALESCE(j.company, 'Unknown') as company
       FROM applications a
       LEFT JOIN jobs j ON a.job_id = j.id
       ORDER BY a.updated_at DESC`
    )
    .all();
  return NextResponse.json({ applications });
}

export async function POST(request: NextRequest) {
  try {
    const { jobTitle, company, jobId } = await request.json();
    const db = getDb();

    let actualJobId = jobId;
    if (!actualJobId) {
      actualJobId = uuidv4();
      db.prepare(
        "INSERT INTO jobs (id, title, company, source) VALUES (?, ?, ?, 'manual')"
      ).run(actualJobId, jobTitle || "Untitled", company || "Unknown");
    }

    const id = uuidv4();
    db.prepare(
      "INSERT INTO applications (id, user_id, job_id, status, updated_at) VALUES (?, 'anonymous', ?, 'new', datetime('now'))"
    ).run(id, actualJobId);

    return NextResponse.json({ id, status: "new" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, status, notes } = await request.json();
    const db = getDb();

    if (status) {
      db.prepare(
        "UPDATE applications SET status = ?, applied_at = CASE WHEN ? = 'applied' AND applied_at IS NULL THEN datetime('now') ELSE applied_at END, updated_at = datetime('now') WHERE id = ?"
      ).run(status, status, id);
    }
    if (notes !== undefined) {
      db.prepare("UPDATE applications SET notes = ?, updated_at = datetime('now') WHERE id = ?").run(notes, id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();
  db.prepare("DELETE FROM applications WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
