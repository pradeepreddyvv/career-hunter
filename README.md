# Career Hunter

[![CI](https://github.com/pradeepreddyvv/career-hunter/actions/workflows/ci.yml/badge.svg)](https://github.com/pradeepreddyvv/career-hunter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

> Open-source AI-powered career platform. Job discovery, mock interviews, resume generation, LeetCode coaching, application tracking -- all in one self-hosted app.

**No external services required.** Just a free Gemini API key and `npm run dev`.

**Live Demo:** [pradeepreddyvv.github.io/career-hunter](https://pradeepreddyvv.github.io/career-hunter/)

## What You Get

| Feature | Description |
|---------|-------------|
| **Job Discovery** | Auto-fetch from 80+ companies via free public ATS APIs |
| **ML Classification** | DistilBERT model classifies jobs by type and role (99.4% accuracy) |
| **ML Scoring** | Sentence-transformer scores resume-job fit (0-100, no API cost) |
| **Mock Interviews** | Voice-first practice with real-time transcription and AI STAR scoring |
| **Live AI Interviewer** | 3 personas: Bar Raiser, Grilling, Friendly -- with silence detection |
| **LeetCode Coach** | 3 AI personas (Interviewer, Teacher, NeetCode) + browser userscript |
| **Resume Builder** | ATS-optimized generation with keyword matching and role classification |
| **Cover Letters** | 4-paragraph architecture with role-adaptive themes |
| **Outreach Generator** | LinkedIn DM, cold email, referral ask -- auto-personalized |
| **Interview Prep** | Command center with project deep-dives, STAR stories, day-of checklists |
| **Application Pipeline** | Kanban tracker: New -> Applied -> Interview -> Offer -> Rejected |
| **Task Management** | Categorized tasks, daily journal, time tracking |

## Quick Start (4 steps, ~2 minutes)

### Option A: Full App (Next.js)

```bash
# 1. Clone and install
git clone https://github.com/pradeepreddyvv/career-hunter.git
cd career-hunter
npm install

# 2. Get a free Gemini API key
# Go to https://aistudio.google.com/apikey -> "Create API Key" (free, 15 req/min)

# 3. Configure
cp .env.example .env.local
# Edit .env.local and paste your Gemini key:
#   GEMINI_API_KEY=your_key_here

# 4. Run
npm run dev
# Open http://localhost:3000
```

### Option B: Python Backend Only

If you only want the job discovery + ML scoring + document generation backend:

```bash
# 1. Clone and install
git clone https://github.com/pradeepreddyvv/career-hunter.git
cd career-hunter/pipeline
pip install -e .

# 2. Configure
cp .env.example .env
# Edit .env -- set PIPELINE_SECRET_KEY (any random 32+ char string)

# 3. Run
career-pipeline serve
# Open http://localhost:8000
```

### Option C: Docker

```bash
git clone https://github.com/pradeepreddyvv/career-hunter.git
cd career-hunter
cp .env.example .env
# Add your GEMINI_API_KEY to .env
docker-compose up
# Open http://localhost:3000
```

## What Happens After Setup

The **onboarding wizard** walks you through 3 steps:

1. **Profile** -- Your name, background, and skills (personalizes all AI output)
2. **Resume** -- Paste your resume text or upload PDF/DOCX (powers resume tailoring)
3. **Target** -- Pick your target role and companies

After that, you land on the dashboard with access to all features. No accounts needed for the static pages -- your data stays in a local SQLite file.

## Pages & Features

### Main Dashboard (`/`)

The landing page with quick access to all tools. Browse jobs, see stats, and jump to any feature.

### Job Browser (`/` on Python backend)

Browse 9,000+ jobs fetched from 69 company career pages. Features:
- Filter by role category (SDE, ML/AI, Frontend, Fullstack, Data, DevOps)
- Filter by employment type (Full-Time, Internship, Contract, New Grad, Co-op)
- Search by title, company, or keywords
- **ML Score** -- Score jobs against your resume using sentence embeddings (free, no API key)
- **Gemini AI Score** -- Detailed scoring with Gemini (requires your own API key)
- **Keyword Score** -- Client-side keyword matching (instant, no API)
- Sort by score, date, or company

### Interview Coach (`/interview-coach`)

AI-powered mock interview practice:
- Choose interview format (behavioral, technical, system design)
- Voice recording with real-time transcription (Web Speech API, free)
- AI scores your answers using STAR framework (0-100)
- 3 interviewer personas with different styles
- Session history and progress tracking

### Interview Command Center (`/interview-prep`)

Comprehensive preparation dashboard:
- 5 project deep-dives with talking points
- Amazon Leadership Principle mappings
- DSA prep plan with problem sets
- STAR story templates
- Mock interview mode
- Day-of interview checklists

### Recording Studio (`/interview-recorder`)

Webcam-based interview practice:
- Record yourself answering questions
- Live AI interviewer with 3 personas
- Review recordings with AI feedback
- LeetCode integration for coding interviews

### Interview Scorecard (`/interview-scorecard`)

Track your readiness across all preparation areas:
- Questions, projects, decisions scored individually
- Overall readiness percentage
- Weak area identification

### Career Dashboard (`/career-dashboard`)

Career management hub:
- Profile data editor
- AI prompts library (browse and customize)
- Job processing queue
- API endpoint configuration

### Task Hub (`/task-hub`)

Task management with categories:
- Interview Prep, Applications, Coding/DSA, Learning, Admin, Health/Life
- AI Task Advisor chat
- Daily journal
- Time tracking

### LeetCode Companion (Browser Userscript)

Captures live code from LeetCode/NeetCode and connects to Career Hunter for AI-powered coding interview practice. See [userscript/README.md](userscript/README.md).

## Architecture

```
Career Hunter
├── Next.js App (TypeScript + React)
│   ├── /                    -- Dashboard with stats and quick actions
│   ├── /onboarding          -- First-time setup wizard
│   ├── /jobs                -- Browse jobs from 80+ companies
│   ├── /interview           -- Voice-first mock interview
│   ├── /interview/live      -- Live AI interviewer (3 personas)
│   ├── /interview/history   -- Past sessions and answers
│   ├── /interview/progress  -- Weak areas and trends
│   ├── /leetcode            -- LeetCode problem coach
│   ├── /resume              -- Generate ATS-tailored resumes
│   ├── /cover-letter        -- Generate cover letters
│   ├── /outreach            -- Generate LinkedIn/email messages
│   ├── /pipeline            -- Kanban application tracker
│   ├── /profile             -- Your background and skills
│   └── /api/*               -- 25+ API routes
│
├── Python Backend (FastAPI) [in pipeline/]
│   ├── Job Sources          -- Greenhouse, Lever, Ashby, Muse, Remotive, GitHub
│   ├── ML Models            -- DistilBERT classifier + MiniLM scorer (ONNX)
│   ├── AI Pipeline          -- Gemini-powered doc generation (9 doc types)
│   ├── 38 API Endpoints     -- Auth, jobs, ML, pipeline, documents, interview
│   └── 8 Dashboard Pages    -- Served as static HTML
│
├── Static Dashboards (GitHub Pages) [in docs/]
│   ├── index.html               -- Career Hub (job browse, AI scoring, docs)
│   ├── interview_coach.html     -- AI mock interviews with 3 coaching personas
│   ├── interview_recorder.html  -- Recording studio with playback
│   └── career_dashboard.html    -- Analytics overview & tools launcher
│
└── Storage
    ├── SQLite (zero config)  -- All data in ./data/
    ├── ONNX Models (86MB)    -- Classification + scoring
    └── localStorage          -- Client-side preferences
```

## Self-Hosting Guide

### Requirements

| Requirement | Cost | Notes |
|-------------|------|-------|
| Gemini API key | Free | 15 req/min free tier. [Get key](https://aistudio.google.com/apikey) |
| Node.js 18+ | Free | For the Next.js frontend |
| Python 3.9+ | Free | For the pipeline backend (optional) |
| Chrome | Free | For voice features (Web Speech API) |
| VPS (optional) | $6/mo | DigitalOcean 2GB droplet for always-on server |

### Local Development

```bash
# Frontend (Next.js)
cd career-hunter
npm install
npm run dev          # http://localhost:3000

# Backend (Python, in a separate terminal)
cd career-hunter/pipeline
pip install -e .
career-pipeline serve  # http://localhost:8000
```

### Production Deployment (VPS)

#### Step 1: Server Setup

```bash
ssh root@your-server
apt update && apt install -y python3 python3-venv python3-pip nodejs npm

# Clone
git clone https://github.com/pradeepreddyvv/career-hunter.git /opt/career-hunter
cd /opt/career-hunter
```

#### Step 2: Python Backend

```bash
cd /opt/career-hunter/pipeline
python3 -m venv venv
source venv/bin/activate
pip install -e .

# Configure
cp .env.example .env
# Edit .env -- set PIPELINE_SECRET_KEY

# Systemd service
cat > /etc/systemd/system/career-pipeline.service << 'EOF'
[Unit]
Description=Career Pipeline API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/career-hunter/pipeline
Environment=PATH=/opt/career-hunter/pipeline/venv/bin:/usr/bin:/bin
ExecStart=/opt/career-hunter/pipeline/venv/bin/uvicorn pipeline.api.app:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable career-pipeline
systemctl start career-pipeline
```

#### Step 3: Next.js Frontend (Optional)

```bash
cd /opt/career-hunter
npm install
npm run build

# Systemd service
cat > /etc/systemd/system/career-hunter.service << 'EOF'
[Unit]
Description=Career Hunter Frontend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/career-hunter
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable career-hunter
systemctl start career-hunter
```

#### Step 4: ML Models (Optional but Recommended)

Train on your local machine (needs PyTorch + GPU/CPU):

```bash
cd career-hunter/pipeline

# Train classifier (~18 min on CPU)
python3 -m ml.train_classifier \
  --data ml/data/training_jobs.json \
  --output ml/models/bert-job-classifier \
  --epochs 3 --batch-size 32 --lr 3e-5 --max-len 128

# Export to ONNX (no PyTorch needed on server)
python3 -m ml.export_onnx \
  --model-dir ml/models/bert-job-classifier \
  --output ml/models/bert-job-classifier-onnx

# Export sentence scorer
python3 -m ml.export_sentence_model \
  --output ml/models/sentence-scorer-onnx

# Upload to server
scp -r ml/models/bert-job-classifier-onnx root@your-server:/opt/career-hunter/pipeline/ml/models/
scp -r ml/models/sentence-scorer-onnx root@your-server:/opt/career-hunter/pipeline/ml/models/

# Install inference deps on server (lightweight, no PyTorch)
ssh root@your-server "cd /opt/career-hunter/pipeline && source venv/bin/activate && pip install onnxruntime transformers"
```

#### Step 5: HTTPS with Cloudflare Tunnel (Free)

```bash
# On your server
curl -fsSL https://pkg.cloudflare.com/cloudflared-linux-amd64.deb -o cloudflared.deb
dpkg -i cloudflared.deb

# Quick tunnel (temporary URL)
cloudflared tunnel --url http://localhost:8000

# For persistent tunnel with custom domain:
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
```

#### Step 6: Verify

```bash
# Health
curl http://localhost:8000/api/v1/health
# {"status":"healthy","db":"ok","version":"1.0.0"}

# ML model
curl http://localhost:8000/api/v1/ml/status
# {"loaded":true,"model_type":"distilbert-base-uncased (ONNX INT8)",...}

# Classify a job
curl -X POST http://localhost:8000/api/v1/ml/classify \
  -H "Content-Type: application/json" \
  -d '{"title":"Software Engineer Intern","description":"Python AWS"}'
# {"employment_type":"Internship","employment_confidence":0.99,"role_category":"SDE",...}

# Browse jobs
curl "http://localhost:8000/api/v1/jobs/browse?limit=3"
```

### Docker Deployment

```bash
git clone https://github.com/pradeepreddyvv/career-hunter.git
cd career-hunter
cp .env.example .env
# Edit .env -- add GEMINI_API_KEY and JWT_SECRET

# Start everything
docker-compose up -d

# With n8n scraping (for Workday, LinkedIn portals)
docker-compose --profile scraping up -d
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | **Yes** | — | Google Gemini API key. [Get one free](https://aistudio.google.com/apikey) |
| `JWT_SECRET` | Production | `career-hunter-docker-secret` | Secret for signing auth tokens |
| `SPEECHMATICS_API_KEY` | No | — | Better STT quality ($0.50/hr). Falls back to Web Speech API |
| `OPENAI_API_KEY` | No | — | Alternative to Gemini. Any OpenAI-compatible API works |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | Custom endpoint for local LLMs |
| `SQLITE_PATH` | No | `./data/career-hunter.db` | Database file location |
| `DATABASE_URL` | No | — | PostgreSQL connection string (overrides SQLite) |
| `RESEND_API_KEY` | No | — | Email alerts (3,000/month free) |
| `NOTIFICATION_EMAIL` | No | — | Email address for job alerts |
| `APIFY_TOKEN` | No | — | LinkedIn scraping via n8n ($5/mo) |
| `N8N_URL` | No | — | n8n instance for Workday/LinkedIn scraping |

**Python backend variables** (prefix `PIPELINE_`):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PIPELINE_SECRET_KEY` | **Yes** | — | JWT signing key (32+ chars) |
| `PIPELINE_DATABASE_URL` | No | `sqlite+aiosqlite:///./data/pipeline.db` | Database URL |
| `PIPELINE_ENABLE_CRON` | No | `true` | Auto-fetch jobs on schedule |
| `PIPELINE_FETCH_CRON_HOUR` | No | `2` | UTC hour for daily fetch |
| `PIPELINE_INTERN_ONLY` | No | `false` | Filter to internships only |
| `PIPELINE_FETCH_SOURCES` | No | `["greenhouse","lever","ashby","muse","remotive","github"]` | Active sources |

## ML Models

The system includes two ONNX models for local inference (no GPU, no API costs):

### Job Classifier (DistilBERT)
- Fine-tuned on 9,335 labeled jobs
- Classifies employment type (99.8% accuracy) and role category (98.9%)
- 64MB ONNX INT8 quantized
- ~125ms inference on 1 vCPU

### Resume-Job Scorer (MiniLM-L6-v2)
- Pre-trained sentence encoder for semantic similarity
- Cosine similarity rescaled to 0-100
- 22MB ONNX INT8 quantized
- Correctly ranks: Backend Eng (86) > Frontend (48) > DevOps (39) > ML (21) > Chef (4)

Both models combined: **86MB** total on server. No PyTorch needed for inference.

## Job Discovery

Career Hunter fetches jobs from company career pages using free, public APIs:

| ATS | Companies | Example |
|-----|-----------|---------|
| Greenhouse | 48 | Stripe, Airbnb, Cloudflare, Databricks, Figma |
| Ashby | 20 | Notion, Ramp, Linear, Vercel, Replit, Cursor |
| Lever | 1 | Spotify |
| The Muse | 7 categories | 700+ internship listings |
| Remotive | All | Remote software jobs |
| GitHub | 7 repos | Curated intern job lists |

### Add a Company

Edit `data/companies.json` (Next.js) or `pipeline/job_sources/companies.json` (Python):

```json
{"name": "YourCompany", "ats": "greenhouse", "slug": "yourcompany"}
```

Find the slug from the company's careers page URL:
- Greenhouse: `boards.greenhouse.io/SLUG`
- Lever: `jobs.lever.co/SLUG`
- Ashby: `jobs.ashbyhq.com/SLUG`

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

Note: Local models are slower and may produce lower-quality results compared to Gemini or GPT-4.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Backend | FastAPI (async Python), SQLAlchemy 2.0 |
| Database | SQLite (default, zero config) / PostgreSQL |
| ML | ONNX Runtime (inference), PyTorch + Transformers (training) |
| AI | Google Gemini (free tier) / OpenAI / Ollama |
| Voice | Web Speech API (free, built into Chrome) / Speechmatics |
| Auth | JWT + bcrypt |
| Deploy | Docker / systemd + Cloudflare Tunnel |

## Project Structure

```
career-hunter/
├── src/                        # Next.js application
│   ├── app/                    # Pages and layouts
│   ├── components/             # React components
│   ├── hooks/                  # Custom hooks (recording, SSE)
│   ├── lib/                    # Core libraries
│   │   ├── ai.ts              # AI provider abstraction
│   │   ├── db.ts              # SQLite database
│   │   ├── speech.ts          # Voice STT/TTS
│   │   ├── prompts.ts         # All AI prompts
│   │   └── job-sources.ts     # ATS API integrations
│   └── types/                  # TypeScript type definitions
├── pipeline/                   # Python backend
│   ├── ml/                     # ML training and inference
│   ├── pipeline/               # FastAPI application
│   │   ├── api/                # API routes (38 endpoints)
│   │   ├── dashboards/         # HTML dashboard pages
│   │   ├── generators/         # AI document generators
│   │   ├── job_sources/        # ATS integrations
│   │   └── workers/            # Background tasks
│   ├── Dockerfile
│   └── pyproject.toml
├── docs/                       # GitHub Pages (static dashboards)
├── data/                       # Company registry
├── workflows/                  # n8n workflow templates
├── userscript/                 # LeetCode companion
├── server.js                   # Custom Next.js server
├── docker-compose.yml
└── .env.example
```

## CLI Commands (Python Backend)

```bash
# Start server
career-pipeline serve [--port 8000] [--reload]

# Fetch jobs from ATS boards
career-pipeline fetch-jobs [--sources greenhouse,lever]

# Check which jobs are still live
career-pipeline check-liveness [--batch-size 100]

# Export jobs to JSON
career-pipeline export-jobs [--output jobs.json]

# Re-classify jobs with ML model
career-pipeline ml-classify

# Test ML model
career-pipeline ml-test

# List available job sources
career-pipeline sources
```

## API Endpoints (Python Backend)

Full interactive docs at `http://localhost:8000/docs`.

**38 endpoints** across 12 modules: auth, profile, health, public jobs, user jobs, pipeline, documents, tasks, events, interview, ML.

Key endpoints:

```bash
# Browse jobs (no auth needed)
GET  /api/v1/jobs/browse?limit=20&role_category=SDE&employment_type=Internship

# ML classify (no auth, no API key)
POST /api/v1/ml/classify  {"title": "...", "description": "..."}

# ML score (no auth, no API key)
POST /api/v1/ml/score  {"resume_text": "...", "limit": 50}

# Generate docs (auth + Gemini key required)
POST /api/v1/pipeline/generate/123
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md).

**Easy ways to start:**
1. **Add companies** -- edit `data/companies.json`
2. **Add interview questions** -- edit `src/lib/questions.ts`
3. **Improve AI prompts** -- edit `src/lib/prompts.ts`
4. **Add ATS integrations** -- Workable, BambooHR, etc.
5. **Add AI providers** -- Anthropic, Cohere, local LLMs
6. **Add n8n workflows** -- new scrapers in `workflows/`

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) -- System design and data flow
- [SELF_HOSTING.md](SELF_HOSTING.md) -- Deployment guide
- [CONTRIBUTING.md](CONTRIBUTING.md) -- How to contribute
- [workflows/README.md](workflows/README.md) -- n8n workflow setup
- [userscript/README.md](userscript/README.md) -- LeetCode companion setup
- [pipeline/README.md](pipeline/README.md) -- Python backend details

## License

MIT
