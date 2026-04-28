import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

interface IngestedJob {
  title: string;
  company: string;
  location?: string;
  description?: string;
  url?: string;
  source?: string;
  salary?: string;
  posted_at?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const jobs: IngestedJob[] = Array.isArray(body.jobs) ? body.jobs : body.jobs ? [body.jobs] : [];
    const source = body.source || "n8n";

    if (jobs.length === 0) {
      return NextResponse.json({ error: "No jobs provided" }, { status: 400 });
    }

    const db = getDb();
    let inserted = 0;
    let duplicates = 0;

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO jobs (id, title, company, location, description, url, source, salary, posted_at, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    for (const job of jobs) {
      if (!job.title || !job.company) continue;

      const normalizedKey = `${job.company.toLowerCase().trim()}|${job.title.toLowerCase().trim()}|${(job.location || "").toLowerCase().trim()}`;

      const existing = db.prepare(
        "SELECT id FROM jobs WHERE lower(company) || '|' || lower(title) || '|' || lower(coalesce(location, '')) = ?"
      ).get(normalizedKey);

      if (existing) {
        duplicates++;
        continue;
      }

      insertStmt.run(
        uuidv4(),
        job.title,
        job.company,
        job.location || "",
        (job.description || "").slice(0, 10000),
        job.url || "",
        source,
        job.salary || "",
        job.posted_at || new Date().toISOString()
      );
      inserted++;
    }

    return NextResponse.json({
      ok: true,
      inserted,
      duplicates,
      total: jobs.length,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
