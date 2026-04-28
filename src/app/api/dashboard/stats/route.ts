import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();

  const jobs = (db.prepare("SELECT COUNT(*) as c FROM jobs").get() as { c: number }).c;
  const applications = (db.prepare("SELECT COUNT(*) as c FROM applications").get() as { c: number }).c;
  const sessions = (db.prepare("SELECT COUNT(*) as c FROM sessions").get() as { c: number }).c;
  const avgScore = (db.prepare("SELECT AVG(score) as avg FROM answers WHERE score > 0").get() as { avg: number | null }).avg;
  const documents = (db.prepare("SELECT COUNT(*) as c FROM documents").get() as { c: number }).c;
  const leetcodeSnapshots = (db.prepare("SELECT COUNT(*) as c FROM leetcode_snapshots").get() as { c: number }).c;

  const recentSessions = (db.prepare(
    "SELECT id, company, role, avg_score, started_at FROM sessions ORDER BY started_at DESC LIMIT 5"
  ).all() as Record<string, unknown>[]).map((r) => ({
    id: r.id,
    company: r.company || "General",
    role: r.role || "",
    avgScore: r.avg_score || 0,
    startedAt: r.started_at,
  }));

  const recentApplications = (db.prepare(
    `SELECT a.id, a.status, a.updated_at, COALESCE(j.title, 'Unknown') as job_title, COALESCE(j.company, 'Unknown') as company
     FROM applications a LEFT JOIN jobs j ON a.job_id = j.id ORDER BY a.updated_at DESC LIMIT 5`
  ).all() as Record<string, unknown>[]).map((r) => ({
    id: r.id,
    status: r.status,
    jobTitle: r.job_title,
    company: r.company,
    updatedAt: r.updated_at,
  }));

  return NextResponse.json({
    jobs,
    applications,
    sessions,
    avgScore: Math.round(avgScore || 0),
    documents,
    leetcodeSnapshots,
    recentSessions,
    recentApplications,
  });
}
