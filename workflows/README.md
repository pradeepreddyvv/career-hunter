# n8n Workflows

Optional n8n workflows for scraping job portals that don't have free APIs (Workday, LinkedIn, Taleo, etc.).

**You don't need n8n.** Career Hunter works standalone with free ATS APIs (Greenhouse, Lever, Ashby, Muse, Remotive). Only set up n8n if you want to scrape additional portals.

## Setup

### 1. Start n8n alongside Career Hunter

```bash
docker-compose --profile scraping up
```

This starts both Career Hunter (port 3000) and n8n (port 5678).

### 2. Import workflows

1. Open n8n at `http://localhost:5678`
2. Go to **Workflows** > **Import from File**
3. Import each JSON file from this directory

### 3. Configure environment

Set these in your `.env`:

```env
N8N_URL=http://localhost:5678
N8N_USER=admin
N8N_PASSWORD=changeme
```

If using the Apify LinkedIn scraper, also set:

```env
APIFY_TOKEN=your_apify_token
```

## Workflows

| Workflow | Webhook | Description |
|----------|---------|-------------|
| `workday-scraper.json` | `/webhook/scrape-workday?url=X` | Scrapes Workday career pages |
| `generic-jd-scraper.json` | `/webhook/scrape-jd?url=X` | Scrapes any job page (tries JSON-LD, ATS detection, then CSS selectors) |
| `daily-scanner.json` | (cron: 7AM + 6PM) | Triggers Career Hunter job refresh + email notification |

## How it works

```
n8n webhook receives URL
  → Fetches page HTML
  → Extracts job data (JSON-LD, ATS API, CSS selectors)
  → POSTs to Career Hunter /api/jobs/ingest
  → Career Hunter deduplicates and saves to SQLite
```

Jobs scraped by n8n appear on the `/jobs` page alongside API-sourced jobs.
