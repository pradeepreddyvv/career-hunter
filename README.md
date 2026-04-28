# Career Hunter

[![CI](https://github.com/pradeepreddyvv/career-hunter/actions/workflows/ci.yml/badge.svg)](https://github.com/pradeepreddyvv/career-hunter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

> Open-source AI-powered career platform. Job discovery, mock interviews, resume generation, LeetCode coaching, application tracking -- all in one self-hosted app.

**No external services required.** Just a free Gemini API key and `npm run dev`.

## Features

- **Job Discovery** -- Auto-fetch from 80+ companies via free public ATS APIs (Greenhouse, Lever, Ashby, The Muse, Remotive)
- **Mock Interviews** -- Voice-first practice with real-time transcription and AI STAR scoring (0-100)
- **Live AI Interviewer** -- 3 personas (Bar Raiser, Grilling, Friendly) with ListenEngine silence detection, auto-interrupt, and session scoring
- **Adaptive Questions** -- AI selects questions targeting your weakest areas, scales difficulty across sessions
- **LeetCode Coach** -- 3 AI personas (Interviewer, Teacher, NeetCode) + browser userscript for live code capture
- **Resume Builder** -- 5-step ATS-optimized generation with keyword matching, role classification, and structured JSON output
- **ATS Audit** -- Post-generation keyword coverage analysis with missing keyword suggestions
- **Cover Letters** -- 4-paragraph architecture with role-adaptive themes and banned-word filtering
- **Outreach Generator** -- 4 message types: LinkedIn note, DM, cold email, referral ask
- **Resume Parsing** -- Upload PDF/DOCX, extract text via Gemini Vision API
- **Application Pipeline** -- Kanban tracker (New -> Applied -> Interview -> Offer -> Rejected)
- **Email Notifications** -- Resend integration for job alert emails (optional, free tier)
- **Progress Tracking** -- Weak areas, score trends, session history
- **Onboarding Flow** -- First-time setup wizard: profile, resume, target role
- **n8n Integration** -- Optional Docker service for scraping Workday, LinkedIn, and other non-API portals
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

Open [http://localhost:3000](http://localhost:3000). The onboarding wizard will guide you through setup.

## Docker

```bash
git clone https://github.com/pradeepreddyvv/career-hunter.git
cd career-hunter
cp .env.example .env
# Add your GEMINI_API_KEY to .env
docker-compose up
```

### With n8n (for non-API job portals)

```bash
docker-compose --profile scraping up
```

This starts n8n on port 5678 alongside Career Hunter. Import workflows from `workflows/` directory. See [workflows/README.md](workflows/README.md).

## What You Need

| Requirement | Cost | Notes |
|-------------|------|-------|
| Gemini API key | Free | 15 req/min free tier. [Get key](https://aistudio.google.com/apikey) |
| Node.js 18+ | Free | Or use Docker |
| Chrome | Free | For voice recording (Web Speech API) |

**That's it.** No Redis, no PostgreSQL, no paid APIs. SQLite handles everything locally.

### Optional Add-ons

| Add-on | Cost | What It Adds |
|--------|------|-------------|
| Resend API key | Free (3k/mo) | Email job alerts to yourself |
| n8n (Docker) | Free | Scrape Workday, LinkedIn, Taleo portals |
| Speechmatics | $0.50/hr | Better speech-to-text quality |
| Apify | $5/mo | LinkedIn job scraping via n8n |

## How It Works

```
Career Hunter (Next.js + SQLite)
├── /                  -- Dashboard with stats, quick actions, email alerts
├── /onboarding        -- First-time setup wizard
├── /jobs              -- Browse jobs from 80+ companies (free ATS APIs)
├── /interview         -- Voice-first mock interview with AI STAR scoring
├── /interview/live    -- Live AI interviewer (3 personas, ListenEngine)
├── /interview/history -- Past sessions and answers
├── /interview/progress -- Weak areas and improvement trends
├── /leetcode          -- LeetCode problem coach (3 personas)
├── /resume            -- Generate ATS-tailored resumes + ATS audit
├── /cover-letter      -- Generate role-specific cover letters
├── /outreach          -- Generate LinkedIn / email / referral messages
├── /pipeline          -- Kanban application tracker
├── /profile           -- Your background, skills, resume upload
└── /api/*             -- 25+ API routes (all self-contained)

Storage: SQLite (zero config, data in ./data/)
AI: Gemini 2.5 Pro (free) or any OpenAI-compatible API
Voice: Web Speech API (free, built into Chrome)
Jobs: Free public ATS APIs + optional n8n scraping
Email: Resend (optional, 3,000/month free)
```

## LeetCode Companion Userscript

Browser userscript that captures your live code from LeetCode/NeetCode and connects to Career Hunter for AI-powered coding interview practice. See [userscript/README.md](userscript/README.md).

## Job Discovery

Career Hunter fetches jobs directly from company career pages using free, public APIs:

| ATS | Companies | Auth Required |
|-----|-----------|--------------|
| Greenhouse | Stripe, Airbnb, Cloudflare, Databricks, Figma, 40+ more | None |
| Lever | Spotify, Twitch, Netflix | None |
| Ashby | Notion, Ramp, Linear, Vercel, Replit, Cursor | None |
| The Muse | 700+ internship listings | None |
| Remotive | Remote software jobs | None |
| n8n (optional) | Workday, LinkedIn, Taleo, any portal | Requires n8n Docker |

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
| Email | Resend (optional) |
| Scraping | n8n (optional Docker service) |
| Deploy | Docker or Node.js |

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md).

**Easy ways to start:**

1. **Add companies** -- edit `data/companies.json`
2. **Add interview questions** -- edit `src/lib/questions.ts`
3. **Improve AI prompts** -- edit `src/lib/prompts.ts`
4. **Add ATS integrations** -- Workable, BambooHR, etc.
5. **Add AI providers** -- Anthropic, Cohere, local LLMs
6. **Add n8n workflows** -- new scraper workflows in `workflows/`
7. **UI/UX** -- accessibility, mobile, themes

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) -- System design and data flow
- [SELF_HOSTING.md](SELF_HOSTING.md) -- Deployment guide and environment variables
- [CONTRIBUTING.md](CONTRIBUTING.md) -- How to contribute
- [workflows/README.md](workflows/README.md) -- n8n workflow setup guide
- [userscript/README.md](userscript/README.md) -- LeetCode companion setup

## License

MIT
