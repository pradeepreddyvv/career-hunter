import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type === "stats") {
    const sessions = db.prepare("SELECT COUNT(*) as c FROM sessions").get() as { c: number };
    const answers = db.prepare("SELECT COUNT(*) as c FROM answers").get() as { c: number };
    const avgScore = db.prepare("SELECT AVG(score) as avg FROM answers WHERE score > 0").get() as { avg: number | null };
    const totalDur = db.prepare("SELECT SUM(duration_sec) as total FROM answers").get() as { total: number | null };

    return NextResponse.json({
      totalSessions: sessions.c,
      totalAnswers: answers.c,
      avgScore: Math.round(avgScore.avg || 0),
      totalMinutes: Math.round((totalDur.total || 0) / 60),
    });
  }

  const rows = (
    db.prepare("SELECT * FROM weak_areas ORDER BY avg_score ASC").all() as Record<string, unknown>[]
  ).map((r) => ({
    ...r,
    score_history: r.score_history ? JSON.parse(r.score_history as string) : [],
  }));

  return NextResponse.json({ weakAreas: rows });
}
