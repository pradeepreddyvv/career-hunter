# Career Hunter

[![CI](https://github.com/pradeepreddyvv/career-hunter/actions/workflows/ci.yml/badge.svg)](https://github.com/pradeepreddyvv/career-hunter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

> Open-source AI-powered career platform. Job discovery, mock interviews, resume generation, LeetCode coaching, application tracking -- all in one self-hosted app.

**No external services required.** Just a free Gemini API key and `npm run dev`.

## Features

- **Job Discovery** -- Auto-fetch from 80+ companies via free public ATS APIs (Greenhouse, Lever, Ashby, The Muse, Remotive)
- **Mock Interviews** -- Voice-first practice with real-time transcription and AI STAR scoring (0-100)
- **Live AI Interviewer** -- Conversational mock interview with follow-up questions
- **LeetCode Coach** -- 3 AI personas (Interviewer, Teacher, NeetCode) for coding problems
- **Resume Builder** -- ATS-optimized resumes tailored to specific job descriptions
- **Cover Letters** -- Company-specific, role-adaptive generation
- **Outreach Generator** -- LinkedIn DM, cold email, referral ask templates
- **Application Pipeline** -- Kanban tracker (New -> Applied -> Interview -> Offer -> Rejected)
- **Progress Tracking** -- Weak areas, score trends, session history
- **Profile System** -- Save your background once, auto-fill everywhere

## Quick Start

```bash
git clone https://github.com/pradeepreddyvv/career-hunter.git
cd career-hunter
cp .env.example .env.local
```

Add your Gemini API key to `.env.local` ([get one free](https://aistudio.google.com/apikey) -- 15 req/min):

```
GEMINI_API_KEY=your_key_here
```

Then:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Register an account and start using it.

## Docker

```bash
git clone https://github.com/pradeepreddyvv/career-hunter.git
cd career-hunter
cp .env.example .env
# Add your GEMINI_API_KEY to .env
docker-compose up
```

## What You Need

| Requirement | Cost | Notes |
|-------------|------|-------|
| Gemini API key | Free | 15 req/min free tier. [Get key](https://aistudio.google.com/apikey) |
| Node.js 18+ | Free | Or use Docker |
| Chrome | Free | For voice recording (Web Speech API) |

**That's it.** No n8n, no Redis, no PostgreSQL, no paid APIs. SQLite handles everything locally.

## How It Works

```
Career Hunter (Next.js + SQLite)
├── /                -- Dashboard with stats and recent activity
├── /jobs            -- Browse jobs from 80+ companies (free ATS APIs)
├── /interview       -- Voice-first mock interview with AI STAR scoring
├── /interview/live  -- Conversational AI interviewer
├── /interview/history -- Past sessions and answers
├── /interview/progress -- Weak areas and improvement trends
├── /leetcode        -- LeetCode problem coach (3 personas)
├── /resume          -- Generate ATS-tailored resumes
├── /cover-letter    -- Generate role-specific cover letters
├── /outreach        -- Generate LinkedIn DM / cold email / referral ask
├── /pipeline        -- Kanban application tracker
├── /profile         -- Your background, skills, resume text
└── /api/*           -- 20+ API routes (all self-contained)

Storage: SQLite (zero config, data in ./data/)
AI: Gemini 2.5 Pro (free) or any OpenAI-compatible API
Voice: Web Speech API (free, built into Chrome)
Jobs: Free public ATS APIs (no scraping, no auth needed)
```

## Job Discovery

Career Hunter fetches jobs directly from company career pages using free, public APIs:

| ATS | Companies | Auth Required |
|-----|-----------|--------------|
| Greenhouse | Stripe, Airbnb, Cloudflare, Databricks, Figma, 40+ more | None |
| Lever | Spotify, Twitch, Netflix | None |
| Ashby | Notion, Ramp, Linear, Vercel, Replit, Cursor | None |
| The Muse | 700+ internship listings | None |
| Remotive | Remote software jobs | None |

Jobs are cached in SQLite (1-hour TTL) and deduplicated across sources.

### Add a Company

Edit `data/companies.json`:

```json
{ "name": "YourCompany", "ats": "greenhouse", "slug": "yourcompany", "category": "fintech" }
```

Find the slug from the company's careers page URL (e.g., `boards.greenhouse.io/stripe` -> slug is `stripe`).

## Alternative AI Providers

### OpenAI / GPT-4

```env
OPENAI_API_KEY=sk-...
```

### Local LLM (Ollama)

```bash
ollama serve && ollama pull llama3.1
```

```env
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Database | SQLite (better-sqlite3, WAL mode) |
| AI | Google Gemini / OpenAI (multi-provider, streaming) |
| Voice | Web Speech API (free, built-in) |
| Auth | JWT + bcrypt |
| Deploy | Docker or Node.js |

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md).

**Easy ways to start:**

1. **Add companies** -- edit `data/companies.json`
2. **Add interview questions** -- edit `src/lib/questions.ts`
3. **Improve AI prompts** -- better resume/cover letter/feedback quality
4. **Add ATS integrations** -- Workable, BambooHR, etc.
5. **Add AI providers** -- Anthropic, Cohere, local LLMs
6. **UI/UX** -- accessibility, mobile, themes

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) -- System design and data flow
- [SELF_HOSTING.md](SELF_HOSTING.md) -- Deployment guide and environment variables
- [CONTRIBUTING.md](CONTRIBUTING.md) -- How to contribute

## License

MIT
