import { NextRequest, NextResponse } from "next/server";
import { getSessionQuestions, getAllQuestions } from "@/lib/questions";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company") || "Amazon";
  const count = parseInt(searchParams.get("count") || "5", 10);
  const all = searchParams.get("all") === "true";

  if (all) {
    return NextResponse.json({ questions: getAllQuestions(company) });
  }

  return NextResponse.json({ questions: getSessionQuestions(count, company) });
}
