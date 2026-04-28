export type JobSource =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "muse"
  | "remotive"
  | "apify"
  | "jsearch";

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  source: JobSource;
  score?: number;
  analysis?: JobAnalysis;
  postedAt: string;
  fetchedAt: string;
}

export interface JobAnalysis {
  score: number;
  summary: string;
  recommendation: string;
  matchedSkills: string[];
  missingSkills: string[];
}
