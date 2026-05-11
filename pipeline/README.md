# Career Pipeline

AI-powered job discovery, scoring, and application document generation. Bring your own Gemini API key — finds jobs from 69 company boards (Greenhouse, Lever, Ashby) plus The Muse and Remotive, scores them against your profile, and generates tailored resumes, cover letters, outreach messages, and interview prep.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/career-pipeline/career-pipeline.git
cd career-pipeline
pip install -e .

# 2. Configure
cp .env.example .env
# Edit .env — set PIPELINE_SECRET_KEY (required, any random 32+ char string)

# 3. Run
career-pipeline serve
# Server starts at http://localhost:8000
```

## Architecture

```
Client (Browser / CLI)
    │
    ▼
┌─────────────────────────────────────────┐
│  FastAPI Server (pipeline.api.app)       │
│  ├── Auth (JWT + bcrypt)                 │
│  ├── Rate Limiting (per-user)            │
│  ├── Request ID Tracing                  │
│  └── CORS                                │
├─────────────────────────────────────────┤
│  API Routes (/api/v1/)                   │
│  ├── /auth     — register, login, me     │
│  ├── /profile  — career vault, API key   │
│  ├── /jobs     — list, fetch, search     │
│  ├── /pipeline — run, score, generate    │
│  ├── /documents — retrieve, export ZIP   │
│  ├── /tasks    — background job status   │
│  └── /events   — SSE progress stream     │
├─────────────────────────────────────────┤
│  Services                                │
│  ├── AuthService     — JWT, bcrypt,      │
│  │                     API key encryption│
│  ├── JobService      — fetch orchestrator│
│  ├── PipelineService — score + generate  │
│  └── DocumentService — export, ZIP       │
├─────────────────────────────────────────┤
│  Job Sources (async, parallel)           │
│  ├── Greenhouse  (48 companies)          │
│  ├── Lever       (1 company)             │
│  ├── Ashby       (20 companies)          │
│  ├── The Muse    (7 categories)          │
│  ├── Remotive    (remote jobs)           │
│  ├── LinkedIn    (guest API)             │
│  └── GitHub Repos (7 intern repos)       │
├─────────────────────────────────────────┤
│  AI Pipeline (Gemini)                    │
│  ├── Scorer      — 0-100 job match       │
│  ├── Classifier  — role categorization   │
│  └── Generator DAG:                      │
│      company_research (gate)             │
│        ├── resume_text → ats_audit       │
│        ├── resume_latex                  │
│        ├── cover_letter                  │
│        ├── outreach                      │
│        ├── follow_up                     │
│        ├── interview_prep (score≥60)     │
│        └── multi_score                   │
├─────────────────────────────────────────┤
│  Data Layer                              │
│  ├── SQLite (default) / PostgreSQL       │
│  ├── SQLAlchemy 2.0 async                │
│  └── Repository pattern (user-isolated)  │
└─────────────────────────────────────────┘
```

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Login (returns JWT) |
| GET | `/api/v1/auth/me` | Current user |

### Profile
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/PUT | `/api/v1/profile/` | Career vault (resume text) |
| PUT/DELETE | `/api/v1/profile/api-key` | Gemini API key (encrypted) |
| PUT | `/api/v1/profile/settings` | Preferences, blacklist |

### Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/jobs/` | List jobs (paginated, filterable) |
| POST | `/api/v1/jobs/fetch` | Trigger async job fetch |
| GET | `/api/v1/jobs/sources` | Available companies |
| GET/DELETE | `/api/v1/jobs/{id}` | Get or delete job |

### Pipeline
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/pipeline/run` | Full pipeline (fetch→score→generate) |
| POST | `/api/v1/pipeline/score` | Score jobs against profile |
| POST | `/api/v1/pipeline/generate/{id}` | Generate docs for one job |

### Documents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/documents/{job_id}` | All docs for a job |
| GET | `/api/v1/documents/{job_id}/{type}` | Specific document |
| POST | `/api/v1/documents/export` | Export as ZIP |

### Tasks & Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/tasks/` | List background tasks |
| GET | `/api/v1/tasks/{id}` | Task status + progress |
| GET | `/api/v1/events/stream?task_id=X` | SSE progress stream |

## Documents Generated Per Job

| Document | Format | Description |
|----------|--------|-------------|
| Resume (text) | Plain text | ATS-optimized, tailored to JD |
| Resume (LaTeX) | .tex | Compilable LaTeX file |
| Cover Letter | Text | 4-paragraph, company-specific |
| Outreach | JSON | LinkedIn note, cold email, referral ask |
| Interview Prep | JSON | 5 behavioral + 5 technical questions |
| Follow-Up | JSON | Post-application and post-interview |
| ATS Audit | JSON | Keyword coverage analysis |
| Company Research | Text | Hidden keywords via search grounding |
| Multi-Score | JSON | Dimensional scoring breakdown |

## Configuration

All configuration is via environment variables (or `.env` file):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PIPELINE_SECRET_KEY` | Yes | — | JWT signing + API key encryption |
| `PIPELINE_HOST` | No | `0.0.0.0` | Server bind host |
| `PIPELINE_PORT` | No | `8000` | Server bind port |
| `PIPELINE_DATABASE_URL` | No | `sqlite+aiosqlite:///./data/pipeline.db` | Database URL |
| `PIPELINE_RATE_LIMIT_PER_MINUTE` | No | `60` | API rate limit per user |
| `PIPELINE_GEMINI_CONCURRENT_LIMIT` | No | `5` | Max concurrent Gemini calls |
| `PIPELINE_MAX_CONCURRENT_PIPELINES` | No | `3` | Max background pipelines |
| `PIPELINE_DEFAULT_GEMINI_MODEL` | No | `gemini-2.5-pro` | Default Gemini model |

## Adding Companies

Edit `pipeline/job_sources/companies.json`:

```json
[
  {"name": "Your Company", "slug": "your-slug", "ats": "greenhouse"},
  ...
]
```

Supported ATS: `greenhouse`, `lever`, `ashby`

## Docker

```bash
docker compose up -d
# Server at http://localhost:8000
```

For PostgreSQL:

```bash
# Uncomment postgres service in docker-compose.yml, then:
PIPELINE_DATABASE_URL=postgresql+asyncpg://pipeline:pipeline@db:5432/pipeline
docker compose up -d
```

## Development

```bash
pip install -e ".[dev]"
pytest
ruff check pipeline/
```

## License

MIT
