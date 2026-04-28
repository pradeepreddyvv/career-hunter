import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.SQLITE_PATH || path.join(DATA_DIR, "career-hunter.db");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      background TEXT DEFAULT '',
      target_role TEXT DEFAULT '',
      target_company TEXT DEFAULT '',
      experience TEXT DEFAULT '',
      skills TEXT DEFAULT '',
      resume_text TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      company TEXT DEFAULT '',
      role TEXT DEFAULT '',
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      question_count INTEGER DEFAULT 0,
      avg_score REAL DEFAULT 0,
      weak_areas TEXT DEFAULT '[]',
      summary TEXT DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS answers (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      question_id TEXT,
      question_text TEXT NOT NULL,
      question_category TEXT DEFAULT '',
      question_lp TEXT DEFAULT '',
      answer_text TEXT DEFAULT '',
      feedback TEXT DEFAULT '{}',
      score REAL DEFAULT 0,
      duration_sec INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS weak_areas (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      area TEXT NOT NULL,
      total_occurrences INTEGER DEFAULT 1,
      score_history TEXT DEFAULT '[]',
      avg_score REAL DEFAULT 0,
      trend TEXT DEFAULT 'stable',
      last_seen TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      category TEXT DEFAULT 'behavioral',
      company TEXT DEFAULT '',
      leadership_principle TEXT DEFAULT '',
      follow_ups TEXT DEFAULT '[]',
      hints TEXT DEFAULT '',
      difficulty TEXT DEFAULT 'medium',
      is_custom INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      context TEXT DEFAULT '',
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT DEFAULT '',
      url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      source TEXT DEFAULT '',
      ats TEXT DEFAULT '',
      score REAL DEFAULT 0,
      analysis TEXT DEFAULT '{}',
      posted_at TEXT,
      fetched_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      status TEXT DEFAULT 'new',
      applied_at TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      notes TEXT DEFAULT '',
      follow_up_date TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS leetcode_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      code TEXT DEFAULT '',
      problem TEXT DEFAULT '{}',
      chat TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions_to_ask (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      text TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      notes TEXT DEFAULT '',
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id);
    CREATE INDEX IF NOT EXISTS idx_answers_question_lp ON answers(question_lp);
    CREATE INDEX IF NOT EXISTS idx_weak_areas_user ON weak_areas(user_id);
    CREATE INDEX IF NOT EXISTS idx_questions_to_ask_category ON questions_to_ask(category);
    CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
    CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
    CREATE INDEX IF NOT EXISTS idx_jobs_score ON jobs(score);
  `);

  seedDefaultQuestions();
}

function seedDefaultQuestions() {
  const count = (db.prepare("SELECT COUNT(*) as c FROM questions_to_ask").get() as { c: number }).c;
  if (count > 0) return;

  const seed = db.prepare(
    "INSERT INTO questions_to_ask (id, text, category, notes, is_default, created_at) VALUES (?, ?, ?, ?, 1, datetime('now'))"
  );

  const defaults: [string, string, string][] = [
    ["What does a typical day look like for an intern on your team?", "team", "Shows genuine interest in the role. Listen for team rituals, standup cadence, collaboration patterns."],
    ["What projects would I potentially work on during the internship?", "team", "Understand scope and impact. Look for ownership signals."],
    ["How does the team apply its core values in day-to-day decisions?", "culture", "Tests if values are real or performative."],
    ["What does the intern mentorship structure look like?", "intern", "Dedicated mentor vs ad-hoc help. Best teams pair you with a senior engineer who has scheduled 1:1s."],
    ["How do interns get ramped up on the codebase?", "intern", "Look for onboarding docs, starter bugs, ramp-up timeline."],
    ["What is the biggest technical challenge your team is currently working on?", "technical", "Shows you think about hard problems. Reveals team health."],
    ["How does the team balance shipping quickly with maintaining code quality?", "technical", "Reveals engineering culture: CI/CD, code review norms, testing expectations, tech debt handling."],
    ["What happens to successful intern projects after the internship ends?", "intern", "Best answer: they go to production. Shows intern work has real impact."],
    ["How does your team handle code reviews and design reviews?", "technical", "Listen for: review turnaround time, who reviews, design doc templates."],
    ["What are the qualities of the most successful interns you have seen?", "intern", "Calibrate expectations. Common: ownership, asking questions, shipping quickly."],
    ["How is the conversion process from intern to full-time?", "intern", "Understand timeline, criteria, and conversion rate."],
    ["What is one thing you wish you knew before joining this team?", "culture", "Personal and disarming. Gets honest answers about team quirks."],
    ["Can you walk me through how a feature goes from idea to production?", "technical", "Reveals SDLC maturity: design docs, sprint planning, testing, canary deployments."],
    ["What does your team use for monitoring and observability?", "technical", "Shows you care about production systems."],
    ["How does the team decide what to work on — is it top-down roadmap or bottom-up proposals?", "culture", "Reveals autonomy level and engineering input into roadmap."],
  ];

  for (let i = 0; i < defaults.length; i++) {
    seed.run(`qta_${i + 1}`, defaults[i][0], defaults[i][1], defaults[i][2]);
  }
}
