import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  const db = getDb();
  const snapshots = db.prepare(
    `SELECT * FROM leetcode_snapshots ORDER BY created_at DESC LIMIT 20`
  ).all();
  return NextResponse.json({ snapshots });
}

export async function POST(request: NextRequest) {
  try {
    const { code, problem, chat, userId } = await request.json();
    const db = getDb();
    const id = uuidv4();

    db.prepare(
      `INSERT INTO leetcode_snapshots (id, user_id, code, problem, chat, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(id, userId || "anonymous", code || "", JSON.stringify(problem || {}), JSON.stringify(chat || []));

    return NextResponse.json({ id, status: "saved" }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save snapshot", details: String(error) },
      { status: 500 }
    );
  }
}
