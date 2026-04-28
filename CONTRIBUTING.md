# Contributing to Career Hunter

Thank you for your interest in contributing! This guide will help you get started.

## Quick Start for Contributors

```bash
git clone https://github.com/pradeepreddyvv/career-hunter.git
cd career-hunter
cp .env.example .env.local
# Add your Gemini API key to .env.local
npm install
npm run dev
```

## Contribution Paths (Low to High Barrier)

### 1. Add Companies to Registry (Easiest)

Edit `data/companies.json` and add a new entry:

```json
{ "name": "CompanyName", "ats": "greenhouse", "slug": "company-slug", "category": "fintech" }
```

To find the slug:
- Greenhouse: Look at `boards.greenhouse.io/SLUG` on the company careers page
- Lever: Look at `jobs.lever.co/SLUG`
- Ashby: Look at `jobs.ashbyhq.com/SLUG`

Verify: `curl https://boards-api.greenhouse.io/v1/boards/SLUG/jobs | jq '.jobs | length'`

### 2. Add Interview Questions

Add questions to the question bank in `src/lib/questions.ts`.

### 3. Add Company Interview Patterns

Add a new company to `src/lib/company-patterns.ts` with their interview style, focus areas, and tips.

### 4. Improve AI Prompts

Better prompts = better output quality for everyone. Key files:
- `src/app/api/interview/feedback/route.ts` — STAR scoring prompt
- `src/app/api/resume/generate/route.ts` — Resume generation prompt
- `src/app/api/cover-letter/route.ts` — Cover letter prompt

### 5. Add ATS Integrations

Add support for new ATS platforms (Workable, BambooHR, etc.) in `src/lib/job-sources.ts`.

### 6. Add AI Providers

Add support for new AI providers (Anthropic, Cohere, Ollama) in `src/lib/ai.ts`.

### 7. Frontend & UX

Improve components in `src/components/`, add responsive design, accessibility.

## Development Guidelines

- Use TypeScript strictly (no `any` types)
- Follow existing code patterns
- Test your changes locally before submitting
- Keep PRs focused — one feature or fix per PR
- Update README if adding new features

## PR Process

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run `npm run build` to verify no type errors
5. Submit a PR with a clear description

## Code of Conduct

Be respectful, constructive, and inclusive. We're all here to help each other land great jobs.
