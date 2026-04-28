# Self-Hosting Guide

Deploy Career Hunter on your own server in under 5 minutes.

## Option 1: Docker (Recommended)

```bash
git clone https://github.com/pradeepreddyvv/career-hunter.git
cd career-hunter
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
docker-compose up -d
```

Open http://localhost:3000

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key. [Get one free](https://aistudio.google.com/apikey) (15 req/min) |
| `JWT_SECRET` | Production | `career-hunter-docker-secret` | Secret for signing auth tokens. **Change this in production.** |
| `SPEECHMATICS_API_KEY` | No | — | Enables high-quality STT/TTS. Falls back to browser APIs if not set. |
| `OPENAI_API_KEY` | No | — | Alternative to Gemini. Any OpenAI-compatible API works. |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | Custom endpoint for OpenAI-compatible providers. |
| `SQLITE_PATH` | No | `./data/career-hunter.db` | Custom database file location. |
| `DATABASE_URL` | No | — | PostgreSQL connection string. Overrides SQLite. |

### Data Persistence

The database is stored in `./data/career-hunter.db` (mounted as a Docker volume). Your data persists across container restarts and upgrades.

To back up:
```bash
cp data/career-hunter.db data/career-hunter-backup.db
```

## Option 2: Node.js

```bash
git clone https://github.com/pradeepreddyvv/career-hunter.git
cd career-hunter
cp .env.example .env.local
# Edit .env.local and add your GEMINI_API_KEY
npm install
npm run dev
```

For production:
```bash
npm run build
npm start
```

## Option 3: Local LLM (Ollama)

Career Hunter supports any OpenAI-compatible API. To use Ollama:

```bash
# Start Ollama
ollama serve
ollama pull llama3.1

# In .env.local
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
```

Note: Local models are slower and may produce lower-quality interview feedback compared to Gemini or GPT-4.

## Voice Features

### With Speechmatics (Better Quality)

1. Sign up at [portal.speechmatics.com](https://portal.speechmatics.com)
2. Create an API key
3. Add `SPEECHMATICS_API_KEY=your_key` to your env file

Cost: ~$0.50/hour of transcription.

### Without Speechmatics (Free)

Career Hunter automatically falls back to the browser's built-in Web Speech API. This works in Chrome and most Chromium browsers. No API key needed, no cost.

## Upgrading

```bash
git pull
npm install
npm run build
# Restart your server or container
```

Database migrations run automatically on startup. Your data is preserved.

## Troubleshooting

### "No AI provider configured"
Set either `GEMINI_API_KEY` or `OPENAI_API_KEY` in your environment.

### Voice recording doesn't work
- Ensure you're using Chrome or a Chromium-based browser
- Allow microphone access when prompted
- If on HTTPS, Web Speech API requires a secure context

### Docker build fails
- Ensure Docker and Docker Compose are installed
- Check that port 3000 is not in use: `lsof -i :3000`
