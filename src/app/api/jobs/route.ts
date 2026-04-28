import { NextRequest, NextResponse } from "next/server";
import { fetchAllJobs } from "@/lib/job-sources";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") || undefined;
  const company = searchParams.get("company") || undefined;
  const source = searchParams.get("source") || undefined;
  const forceRefresh = searchParams.get("refresh") === "true";
  const companies = company ? [company] : undefined;

  try {
    const result = await fetchAllJobs({ filter, companies, source, forceRefresh });

    return NextResponse.json({
      jobs: result.jobs,
      total: result.jobs.length,
      sources: result.sources,
      cached: result.cached,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch jobs", details: String(error) },
      { status: 500 }
    );
  }
}
