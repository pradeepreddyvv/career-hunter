import fs from "fs";
import path from "path";
import { getDb } from "./db";

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  source: string;
  ats: string;
  score?: number;
  postedAt: string | null;
  fetchedAt: string;
}

interface CompanyEntry {
  name: string;
  ats: "greenhouse" | "lever" | "ashby" | "muse";
  slug: string;
  category?: string;
}

interface CompanyRegistry {
  companies: CompanyEntry[];
  meta: { lastUpdated: string; totalCompanies: number };
}

function loadRegistry(): CompanyRegistry {
  const filePath = path.join(process.cwd(), "data", "companies.json");
  if (!fs.existsSync(filePath)) {
    return { companies: [], meta: { lastUpdated: "", totalCompanies: 0 } };
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export async function fetchGreenhouseJobs(slug: string, companyName: string): Promise<Job[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  const jobs = data.jobs || [];

  return jobs.map((j: Record<string, unknown>) => ({
    id: `gh_${slug}_${j.id}`,
    title: j.title as string,
    company: companyName,
    location: (j.location as { name?: string })?.name || "Remote",
    url: j.absolute_url as string,
    description: (j.content as string) || "",
    source: "greenhouse",
    ats: "greenhouse",
    postedAt: j.updated_at as string,
    fetchedAt: new Date().toISOString(),
  }));
}

export async function fetchLeverJobs(slug: string, companyName: string): Promise<Job[]> {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const jobs = await res.json();
  if (!Array.isArray(jobs)) return [];

  return jobs.map((j: Record<string, unknown>) => ({
    id: `lv_${slug}_${j.id}`,
    title: (j.text as string) || "",
    company: companyName,
    location: (j.categories as { location?: string })?.location || "Remote",
    url: j.hostedUrl as string,
    description: (j.descriptionPlain as string) || "",
    source: "lever",
    ats: "lever",
    postedAt: j.createdAt ? new Date(j.createdAt as number).toISOString() : null,
    fetchedAt: new Date().toISOString(),
  }));
}

export async function fetchAshbyJobs(slug: string, companyName: string): Promise<Job[]> {
  const res = await fetch("https://jobs.ashbyhq.com/api/non-user-graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "ApiJobBoardWithTeams",
      variables: { organizationHostedJobsPageName: slug },
      query: `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
        jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
          jobPostings { id title locationName employmentType descriptionPlain publishedDate }
        }
      }`,
    }),
  });
  if (!res.ok) return [];

  const data = await res.json();
  const postings = data?.data?.jobBoard?.jobPostings || [];

  return postings.map((j: Record<string, unknown>) => ({
    id: `ash_${slug}_${j.id}`,
    title: (j.title as string) || "",
    company: companyName,
    location: (j.locationName as string) || "Remote",
    url: `https://jobs.ashbyhq.com/${slug}/${j.id}`,
    description: (j.descriptionPlain as string) || "",
    source: "ashby",
    ats: "ashby",
    postedAt: (j.publishedDate as string) || null,
    fetchedAt: new Date().toISOString(),
  }));
}

export async function fetchMuseJobs(category: string = "Software Engineering", level: string = "Internship"): Promise<Job[]> {
  const url = `https://www.themuse.com/api/public/jobs?category=${encodeURIComponent(category)}&level=${encodeURIComponent(level)}&page=0`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  const results = data.results || [];

  return results.map((j: Record<string, unknown>) => ({
    id: `muse_${(j.id as number) || Math.random().toString(36).slice(2)}`,
    title: j.name as string,
    company: (j.company as { name?: string })?.name || "Unknown",
    location: ((j.locations as { name: string }[]) || []).map(l => l.name).join(", ") || "Remote",
    url: j.refs ? (j.refs as { landing_page?: string }).landing_page || "" : "",
    description: (j.contents as string) || "",
    source: "muse",
    ats: "muse",
    postedAt: j.publication_date as string,
    fetchedAt: new Date().toISOString(),
  }));
}

export async function fetchRemotiveJobs(search?: string): Promise<Job[]> {
  const params = new URLSearchParams({ category: "software-dev", limit: "50" });
  if (search) params.set("search", search);
  const url = `https://remotive.com/api/remote-jobs?${params}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  const jobs = data.jobs || [];

  return jobs.map((j: Record<string, unknown>) => ({
    id: `rem_${j.id}`,
    title: (j.title as string) || "",
    company: (j.company_name as string) || "Unknown",
    location: (j.candidate_required_location as string) || "Remote",
    url: (j.url as string) || "",
    description: (j.description as string) || "",
    source: "remotive",
    ats: "remotive",
    postedAt: (j.publication_date as string) || null,
    fetchedAt: new Date().toISOString(),
  }));
}

function deduplicateJobs(jobs: Job[]): Job[] {
  const seen = new Map<string, Job>();
  for (const job of jobs) {
    const key = `${job.company.toLowerCase().trim()}|${job.title.toLowerCase().trim()}|${job.location.toLowerCase().trim()}`;
    if (!seen.has(key)) {
      seen.set(key, job);
    }
  }
  return Array.from(seen.values());
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCachedJobs(filter?: string, source?: string): Job[] | null {
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const count = (db.prepare("SELECT COUNT(*) as c FROM jobs WHERE fetched_at > ?").get(cutoff) as { c: number }).c;
    if (count === 0) return null;

    let query = "SELECT * FROM jobs WHERE fetched_at > ?";
    const params: string[] = [cutoff];

    if (source && source !== "all") {
      query += " AND source = ?";
      params.push(source);
    }
    if (filter) {
      query += " AND LOWER(title) LIKE ?";
      params.push(`%${filter.toLowerCase()}%`);
    }
    query += " ORDER BY fetched_at DESC";

    const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      company: r.company as string,
      location: (r.location as string) || "Remote",
      url: (r.url as string) || "",
      description: (r.description as string) || "",
      source: (r.source as string) || "",
      ats: (r.ats as string) || "",
      score: (r.score as number) || undefined,
      postedAt: (r.posted_at as string) || null,
      fetchedAt: (r.fetched_at as string) || new Date().toISOString(),
    }));
  } catch {
    return null;
  }
}

function cacheJobs(jobs: Job[]): void {
  try {
    const db = getDb();
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO jobs (id, title, company, location, url, description, source, ats, posted_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertMany = db.transaction((items: Job[]) => {
      for (const j of items) {
        stmt.run(j.id, j.title, j.company, j.location, j.url, j.description.slice(0, 10000), j.source, j.ats, j.postedAt, j.fetchedAt);
      }
    });
    insertMany(jobs);
  } catch {
    // cache is best-effort
  }
}

export async function fetchAllJobs(options?: {
  filter?: string;
  companies?: string[];
  source?: string;
  forceRefresh?: boolean;
}): Promise<{ jobs: Job[]; cached: boolean; sources: Record<string, number> }> {
  if (!options?.forceRefresh) {
    const cached = getCachedJobs(options?.filter, options?.source);
    if (cached && cached.length > 0) {
      const sources: Record<string, number> = {};
      for (const j of cached) sources[j.source] = (sources[j.source] || 0) + 1;
      return { jobs: cached, cached: true, sources };
    }
  }

  const registry = loadRegistry();
  const allJobs: Job[] = [];

  const targetCompanies = options?.companies
    ? registry.companies.filter(c => options.companies!.includes(c.slug))
    : registry.companies;

  const filteredCompanies = options?.source && options.source !== "all"
    ? targetCompanies.filter(c => c.ats === options.source)
    : targetCompanies;

  const fetchPromises = filteredCompanies.map(async (company) => {
    try {
      switch (company.ats) {
        case "greenhouse":
          return await fetchGreenhouseJobs(company.slug, company.name);
        case "lever":
          return await fetchLeverJobs(company.slug, company.name);
        case "ashby":
          return await fetchAshbyJobs(company.slug, company.name);
        default:
          return [];
      }
    } catch {
      return [];
    }
  });

  const results = await Promise.allSettled(fetchPromises);
  for (const result of results) {
    if (result.status === "fulfilled") {
      allJobs.push(...result.value);
    }
  }

  if (!options?.source || options.source === "all" || options.source === "muse") {
    try {
      const museJobs = await fetchMuseJobs();
      allJobs.push(...museJobs);
    } catch { /* ignore */ }
  }

  if (!options?.source || options.source === "all" || options.source === "remotive") {
    try {
      const remotiveJobs = await fetchRemotiveJobs(options?.filter);
      allJobs.push(...remotiveJobs);
    } catch { /* ignore */ }
  }

  if (!options?.source || options.source === "all" || options.source === "n8n") {
    try {
      const n8nJobs = await fetchFromN8n();
      allJobs.push(...n8nJobs);
    } catch { /* ignore */ }
  }

  const deduped = deduplicateJobs(allJobs);

  let filtered = deduped;
  if (options?.filter) {
    const filterLower = options.filter.toLowerCase();
    filtered = deduped.filter(j => j.title.toLowerCase().includes(filterLower));
  }

  cacheJobs(filtered);

  const sources: Record<string, number> = {};
  for (const j of filtered) sources[j.source] = (sources[j.source] || 0) + 1;

  return { jobs: filtered, cached: false, sources };
}

async function fetchFromN8n(): Promise<Job[]> {
  const n8nUrl = process.env.N8N_URL;
  if (!n8nUrl) return [];

  try {
    const db = getDb();
    const rows = db.prepare(
      "SELECT * FROM jobs WHERE source IN ('n8n', 'workday', 'scraper') AND fetched_at > datetime('now', '-24 hours')"
    ).all() as Array<Record<string, string>>;

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      company: row.company,
      location: row.location || "",
      url: row.url || "",
      description: row.description || "",
      source: row.source || "n8n",
      ats: "n8n",
      score: undefined,
      postedAt: row.posted_at || null,
      fetchedAt: row.fetched_at || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

export function getRegistryCompanies(): CompanyEntry[] {
  return loadRegistry().companies;
}
