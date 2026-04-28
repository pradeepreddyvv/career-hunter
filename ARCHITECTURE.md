# Architecture

> Technical deep-dive into how Career Hunter is built.

## System Diagram

```
Browser (React 18)                    Server (Next.js 14)                 External
┌──────────────────┐    HTTP/SSE     ┌──────────────────┐              ┌───────────┐
│  Interview Page   │◄──────────────►│  API Routes       │◄────────────►│ Gemini API│
│  - QuestionCard   │                │  /api/interview/* │              └───────────┘
│  - RecordingPanel │  WebSocket     │  /api/jobs/*      │              ┌───────────┐
│  - FeedbackCard   │◄─────────────►│  /api/resume/*    │◄────────────►│ ATS APIs  │
│  - SessionSummary │                │  /api/cover-letter│              │ Greenhouse│
├──────────────────┤                │  /api/pipeline/*  │              │ Lever     │
│  Job Browser      │                ├──────────────────┤              │ The Muse  │
│  Resume Generator │                │  Lib Layer        │              └───────────┘
│  Cover Letter     │                │  - ai.ts          │              ┌───────────┐
│  Pipeline Kanban  │                │  - db.ts          │◄────────────►│ SQLite DB │
│  Progress Tracker │                │  - stream.ts      │              │ (WAL mode)│
└──────────────────┘                │  - questions.ts   │              └───────────┘
                                     │  - speech.ts      │              ┌───────────┐
  Web Speech API ◄──────────────────│  - auth.ts        │              │Speechmatic│
  (STT fallback)                     └──────────────────┘              │ (optional)│
                                                                        └───────────┘
```

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js 14 (App Router) | Full-stack in one runtime. API routes + React SSR. |
| **Language** | TypeScript (strict) | Type safety across frontend and backend. Types are the spec. |
| **Styling** | Tailwind CSS | Utility-first, no CSS files to manage. |
| **Database** | SQLite (better-sqlite3) | Zero config, single file, WAL mode for concurrent reads. |
| **AI** | Google Gemini / OpenAI | Multi-provider with streaming. Gemini free tier = zero cost to start. |
| **Voice STT** | Speechmatics / Web Speech API | Speechmatics for quality, Web Speech API as free fallback. |
| **Voice TTS** | Speechmatics / Browser TTS | Same graceful degradation pattern. |
| **Auth** | JWT + bcrypt | Stateless auth, no external service needed. |
| **Deployment** | Docker / Node.js | Single container, `docker-compose up`. |

## Data Flow

### Interview Session

```
1. User configures interview (format, company, question count)
2. Client fetches questions from /api/interview/content
3. For each question:
   a. TTS reads the question aloud (Speechmatics or browser)
   b. User records answer (mic → MediaRecorder → STT transcription)
   c. Transcript sent to /api/interview/feedback via POST
   d. Server streams response via SSE:
      - {type: "thinking"}     → UI shows spinner
      - {type: "token", data}  → UI streams text
      - {type: "done", data}   → UI renders scored feedback
      - {type: "error"}        → UI shows retry button
   e. Answer + feedback saved to SQLite
4. After all questions, /api/interview/feedback?action=summary
5. Session summary with readiness score, weak areas, hiring signal
```

### AI Streaming (SSE)

Every AI interaction uses the same SSE protocol:

```typescript
type AIState = 'idle' | 'thinking' | 'streaming' | 'done' | 'error';
```

The `useSSE` hook manages this state machine on the client. The `createSSEStream` utility handles it on the server. This pattern is reused for interview feedback, session summaries, resume generation, and cover letter generation.

### Job Discovery

```
1. Client requests /api/jobs?companies=stripe,airbnb
2. Server calls free ATS APIs in parallel (Promise.allSettled):
   - Greenhouse: boards-api.greenhouse.io/v1/boards/{slug}/jobs
   - Lever: api.lever.co/v0/postings/{slug}
   - The Muse: themuse.com/api/public/jobs
3. Results normalized to common Job interface
4. Cached in SQLite with TTL
5. Optional: AI scoring via Gemini (match against user profile)
```

## Folder Structure

```
src/
├── app/                        # Next.js App Router pages
│   ├── page.tsx                # Dashboard
│   ├── interview/
│   │   ├── page.tsx            # Voice-first interview flow
│   │   ├── history/page.tsx    # Past sessions
│   │   └── progress/page.tsx   # Weak areas + trends
│   ├── jobs/page.tsx           # Job browser
│   ├── resume/page.tsx         # Resume generator
│   ├── cover-letter/page.tsx   # Cover letter generator
│   ├── pipeline/page.tsx       # Application Kanban
│   ├── profile/page.tsx        # User settings
│   └── api/                    # API routes (thin controllers)
│       ├── interview/
│       │   ├── feedback/       # AI scoring (SSE stream)
│       │   ├── sessions/       # Session CRUD
│       │   ├── content/        # Question bank
│       │   ├── progress/       # Weak areas + stats
│       │   ├── speechmatics-key/ # STT temp token
│       │   └── tts/            # TTS proxy
│       ├── jobs/               # Job fetching + scoring
│       ├── resume/             # Resume generation
│       ├── cover-letter/       # Cover letter generation
│       ├── pipeline/           # Application tracking
│       └── auth/               # Register, login, JWT
├── components/
│   ├── AppNav.tsx              # Sidebar navigation
│   └── interview/             # Decomposed interview UI
│       ├── InterviewConfig.tsx # Format + company picker
│       ├── QuestionCard.tsx    # Question display + LP badge
│       ├── RecordingPanel.tsx  # Mic + transcript + timer
│       ├── FeedbackCard.tsx    # Score ring + STAR bars
│       └── SessionSummary.tsx  # Session results
├── hooks/
│   ├── useSSE.ts               # SSE streaming hook
│   └── useRecording.ts         # Voice recording hook
├── lib/
│   ├── ai.ts                   # Multi-provider AI (text + JSON + stream)
│   ├── db.ts                   # SQLite schema + migrations
│   ├── auth.ts                 # JWT + bcrypt
│   ├── stream.ts               # SSE server utilities
│   ├── speech.ts               # STT/TTS client utilities
│   ├── questions.ts            # Interview question bank
│   ├── job-sources.ts          # ATS API fetchers
│   └── company-patterns.ts     # Company interview patterns
├── types/
│   ├── interview.ts            # FeedbackResult, SessionSummary, etc.
│   ├── jobs.ts                 # Job, JobAnalysis
│   └── queue.ts                # QueueJob (for future batch ops)
└── data/
    └── companies.json          # 37 verified companies with ATS mapping
```

## Design Decisions

### Why SQLite instead of PostgreSQL?

Zero config. Copy the project, run `npm install && npm run dev`, and you have a working database. No Docker, no connection strings, no migrations. SQLite's WAL mode handles concurrent reads from API routes. For a self-hosted career tool, this is the right tradeoff.

PostgreSQL is supported via `DATABASE_URL` env var for production deployments.

### Why SSE instead of WebSockets for AI responses?

SSE is simpler, works through proxies, and fits the one-directional streaming pattern of LLM responses. The client sends a POST, the server streams back events. No connection upgrade, no ping/pong, no reconnection logic. The `useSSE` hook abstracts this into a clean state machine.

### Why Speechmatics + Web Speech API fallback?

Speechmatics gives high-quality real-time transcription. But it costs $0.50/hr and requires an API key. Web Speech API is free, built into Chrome, and good enough for practice. The recording hook tries Speechmatics first, falls back to Web Speech automatically. Users see which one is active.

### Why component decomposition for Interview?

The source project had a 2800-line monolithic interview page. Career Hunter decomposes this into 5 focused components + 2 hooks. Each component handles one concern: configuration, question display, recording, feedback display, session summary. This makes the codebase approachable for contributors.
