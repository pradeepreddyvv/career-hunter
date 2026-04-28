import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendJobAlert, isEmailConfigured } from "@/lib/email";

export async function POST() {
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "Email not configured. Set RESEND_API_KEY and NOTIFICATION_EMAIL in .env.local" },
      { status: 400 }
    );
  }

  try {
    const db = getDb();

    const jobs = db.prepare(`
      SELECT title, company, score, url, location
      FROM jobs
      WHERE fetched_at > datetime('now', '-24 hours')
      ORDER BY score DESC NULLS LAST, fetched_at DESC
      LIMIT 20
    `).all() as { title: string; company: string; score: number | null; url: string; location: string }[];

    if (jobs.length === 0) {
      return NextResponse.json({ sent: false, reason: "No recent jobs to send" });
    }

    const sent = await sendJobAlert(
      jobs.map((j) => ({
        title: j.title,
        company: j.company,
        score: j.score ?? undefined,
        url: j.url,
        location: j.location,
      }))
    );

    return NextResponse.json({ sent, jobCount: jobs.length });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ configured: isEmailConfigured() });
}
