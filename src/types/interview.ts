export interface Question {
  id: string;
  text: string;
  lp: string;
  lpFull: string;
  type: "behavioral";
  company: string;
  followUps: string[];
  hint: string;
}

export type InterviewFormat =
  | "standard"
  | "deep_dive"
  | "rapid_fire"
  | "full_loop";

export interface InterviewConfig {
  format: InterviewFormat;
  company: string;
  numQuestions: number;
  maxFollowUps: number;
}

export interface STARScores {
  situation: number;
  task: number;
  action: number;
  result: number;
}

export interface DimensionScores {
  clarity: number;
  confidence: number;
  conciseness: number;
  storytelling: number;
  technicalDepth: number;
}

export interface DeliveryAnalysis {
  fillerWords: number;
  hedgingPhrases: number;
  powerWords: number;
  pacing: "too_short" | "good" | "too_long";
}

export type Recommendation = "Strong" | "Good" | "Needs Work" | "Redo";

export interface FeedbackResult {
  overallScore: number;
  star: STARScores;
  dimensions: DimensionScores;
  lpAlignment: number;
  delivery: DeliveryAnalysis;
  strengths: string[];
  improvements: string[];
  coachingTip: string;
  idealStructure: string;
  weakAreas: string[];
  recommendation: Recommendation;
  followUpQuestion?: string;
}

export interface SessionSummary {
  sessionScore: number;
  readiness: number;
  hiringSignal: string;
  perQuestion: {
    lp: string;
    score: number;
    oneLiner: string;
  }[];
  strengths: string[];
  weaknesses: string[];
  priorities: {
    area: string;
    drill: string;
  }[];
  encouragement: string;
}

export type AIState = "idle" | "thinking" | "streaming" | "done" | "error";

export interface SSEEvent {
  type: "thinking" | "token" | "done" | "error";
  data?: string;
  error?: string;
}
