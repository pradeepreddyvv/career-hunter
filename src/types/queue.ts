export type QueueJobType =
  | "batch_score"
  | "batch_resume"
  | "batch_cover_letter";

export type QueueJobStatus =
  | "queued"
  | "processing"
  | "done"
  | "failed";

export interface QueueJob<T = unknown> {
  id: string;
  type: QueueJobType;
  payload: T;
  status: QueueJobStatus;
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: string;
}
