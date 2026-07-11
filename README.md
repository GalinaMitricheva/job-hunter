# Job Hunter Agent

A local job-search agent that automates your job search end-to-end — it imports your CV, builds a comprehensive professional profile, runs scheduled searches on LinkedIn and company career pages, uses an LLM to score matches and tailor your CV per posting, and submits applications after you review and approve each one.

**All data stays on your machine. No cloud required (optional Claude API, OpenRouter, or local Ollama).**

---

## Features

- **CV Import** — Drop a PDF, DOCX, or TXT file; the LLM parses it into a structured profile automatically
- **Profile Quiz** — Interactive terminal interview fills any gaps the parser missed; answers persist between sessions
- **Scheduled Job Search** — Searches LinkedIn and target company career pages on a configurable cron schedule
- **AI Relevance Scoring** — Each job is scored 0–100 with a short reasoning note; only high-scoring matches proceed
- **CV Tailoring** — LLM rewrites your summary, reorders experience, and highlights matching skills for each role
- **Cover Letter Generation** — Tailored 3–4 paragraph cover letter per application
- **3 PDF CV Templates** — Classic (ATS-friendly), Modern, Minimal
- **Browser Review UI** — Approve or skip applications at `http://localhost:3000`; edit the cover letter inline before applying
- **Auto-Apply** — Playwright fills and submits LinkedIn Easy Apply, Greenhouse, and Lever forms; saves a confirmation screenshot
- **Manual Fallback** — If auto-apply isn't supported, the agent generates step-by-step instructions for manual submission
- **History** — Full log of every search and application at `localhost:3000/history`
- **Autonomous Mode** — Set `autoApply: true` in `config.json` to skip the review step entirely

---

## Prerequisites

| Tool | Why | Install |
|---|---|---|
| **Node.js 20+** | Runs the agent | https://nodejs.org |
| **Playwright Chromium** | LinkedIn scraping + auto-apply | `npx playwright install chromium` |
| **Claude Code** *(recommended)* | Runs scoring + tailoring on your Claude Pro/Max **subscription** (no API bill) | `npm i -g @anthropic-ai/claude-code`, then `claude` and log in |
| **OpenRouter API key** *(free fallback)* | Hosted free/cheap models when Claude Code is throttled/unavailable | https://openrouter.ai/keys |
| **Claude API key** *(alternative)* | Pay-per-token LLM access | Set `ANTHROPIC_API_KEY` env var |
| **Ollama** *(alternative)* | Local LLM option — not required if using Claude Code or OpenRouter | https://ollama.com |

---

## Setup

```bash
# Clone
git clone https://github.com/GalinaMitricheva/job-hunter.git
cd job-hunter

# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium

# Copy and fill in your config
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "llm": {
    "provider": "claude",
    "claudeApiKey": "sk-ant-...",
    "model": "claude-sonnet-4-6",
    "ollamaBaseUrl": "http://localhost:11434",
    "ollamaModel": "llama3.2",
    "openrouterApiKey": "",
    "openrouterBaseUrl": "https://openrouter.ai/api/v1",
    "openrouterRatingModel": "openai/gpt-oss-120b:free",
    "openrouterTailoringModel": "openai/gpt-oss-120b:free"
  },
  "search": {
    "schedule": "0 8 * * *",
    "fitScoreThreshold": 70,
    "companyUrls": ["https://example.com/careers"],
    "headlessBrowser": true
  },
  "linkedin": {
    "email": "you@example.com",
    "password": "yourpassword"
  },
  "autoApply": false,
  "reviewPort": 3000
}
```

> `config.json` is gitignored — your credentials never leave your machine.

---

## Usage

All commands go through a single entry point:

```bash
npx tsx agent.ts <command>
```

| Command | What it does |
|---|---|
| `profile my-cv.pdf` | Parse your CV and quiz for missing info (first-time setup) |
| `profile` | Re-run the full profile quiz without importing a file |
| `search` | Run a job search session right now |
| `review` | Start the review UI at `http://localhost:3000` |
| `start` | Start scheduler + review UI together (normal daily use) |
| `eval` | Export last N scored jobs to `eval-input.json` for LLM-as-judge review |
| `eval --golden` | Run pre-filter accuracy check against the built-in 100-job golden dataset |

### First-time setup

```bash
# Import your CV and fill in any gaps
npx tsx agent.ts profile my-cv.pdf
```

The agent will:
1. Extract your experience, education, skills, and preferences from the file
2. Ask follow-up questions in the terminal for anything that's missing or unclear
3. Save everything to SQLite — you won't be asked again unless you re-run `profile`

### Daily use

```bash
npx tsx agent.ts start
```

Leave this running. The agent searches on the schedule in `config.json` (default: 8 AM daily), scores matches, tailors CVs, and queues applications. Open `http://localhost:3000` whenever you want to review and approve.

### Run a search immediately

```bash
npx tsx agent.ts search
```

---

## Eval Pipeline

The eval pipeline helps you measure and improve the agent's filtering accuracy over time.

### Export latest scored jobs for LLM review

```bash
npx tsx agent.ts eval [--count 50] [--out path/to/file.json]
```

Exports the last N scored jobs from the database to `eval-input.json`, including the agent's score, reasoning, and your full profile. Open a Claude Code session and say "Run the eval on eval-input.json" — Claude reads each job description and judges whether the agent's score was correct relative to your profile and the threshold in `config.json`.

### Golden dataset (constant benchmark)

```bash
npx tsx agent.ts eval --golden
```

Runs all four pre-filters (not-a-job, wrong-function, too-junior, location) against a committed 100-job dataset (`eval-golden.json`). Each entry has a `ground_truth` label. The command prints a per-filter accuracy report and writes full results to `eval-golden-results.json`.

The golden dataset covers:
- **Clear positives** — senior PM roles in Munich or EU-remote (15 entries)
- **Wrong function** — engineering, sales/BD/CSM, finance, legal roles (28 entries)
- **Wrong location** — US-only or APAC roles (14 entries)
- **Too junior** — intern, APM, graduate, entry-level (9 entries)
- **Not a job posting** — blog posts, culture pages, product pages (6 entries)
- **Borderline** — program managers, product ops, chief of staff (16 entries, some should pass, some shouldn't)
- **Real failures** — 20 entries from an actual production search, including the worst false positives

Use `--golden` after changing the pre-filter regexes in `src/search/filters.ts` to verify you haven't broken anything.

---

## Review UI

Open `http://localhost:3000` in your browser after starting the agent.

- **Queue** — one card per pending application showing the job posting, your tailored CV, and the cover letter side by side
- **Approve & Apply** — triggers Playwright auto-apply; falls back to manual instructions if the site isn't supported
- **Skip** — removes the application from the queue
- **Edit cover letter** — edit inline before approving
- **History** — `localhost:3000/history` shows all submitted and skipped applications

---

## LLM Configuration

Switch providers with the `llm.provider` field in `config.json`. If a call to
the primary provider fails (throttling, CLI error, network), the agent
automatically retries it once on `llm.fallbackProvider` before giving up.

**Claude Code — subscription, no API bill (recommended):**
```json
"llm": {
  "provider": "claude-cli",
  "fallbackProvider": "openrouter",
  "claudeCliCommand": "claude",
  "claudeCliModel": "claude-haiku-4-5"
}
```

This runs rating and tailoring through **headless Claude Code** (`claude -p`),
which authenticates with your **Claude Pro/Max subscription** — far higher
quality than local/free models, with no per-token API charge. Setup:

1. `npm i -g @anthropic-ai/claude-code`
2. Run `claude` once and log in, choosing your **subscription** account (not an API key).
3. Ensure **`ANTHROPIC_API_KEY` is _not_ set** in the environment that runs the agent — if it is, Claude Code bills the paid API instead of your subscription. (The agent also strips it from the CLI's environment as a safeguard.)

Notes:
- Subject to Claude Code's usage limits (rolling 5-hour + weekly caps). The pre-filters keep LLM volume low, so a scheduled run is normally fine; if a call is throttled it falls back to `fallbackProvider`.
- Use `claudeCliModel` to pick the model (`claude-haiku-4-5` is cheap and strong; use a Sonnet model for higher-quality tailoring).
- `claudeCliCommand` lets you point at a specific binary/path (e.g. `claude.cmd` on Windows) if `claude` isn't on PATH.

**Claude API (pay-per-token):**
```json
"llm": { "provider": "claude", "claudeApiKey": "sk-ant-...", "model": "claude-sonnet-4-6" }
```

**OpenRouter (hosted free/cheap models):**
```json
"llm": {
  "provider": "openrouter",
  "openrouterApiKey": "sk-or-...",
  "openrouterBaseUrl": "https://openrouter.ai/api/v1",
  "openrouterRatingModel": "openai/gpt-oss-120b:free",
  "openrouterTailoringModel": "openai/gpt-oss-120b:free"
}
```

OpenRouter is OpenAI-compatible and gives access to strong models at no cost, so **Ollama is not required** for position rating (`scoreJobRelevance`) or CV tailoring (`tailorCV`). The rating and tailoring models are configured independently — start with `openai/gpt-oss-120b:free` for both, and if tailoring prose disappoints, switch `openrouterTailoringModel` to `google/gemma-4-31b-it:free` (no code change needed).

Notes:
- Get a key at https://openrouter.ai/keys — no credit card needed for the free tier.
- Free `:free` models are rate-limited (~20 req/min, 200 req/day) and can lose `:free` status without notice. Keep a fallback in mind (e.g. `nvidia/nemotron-3-super-120b-a12b:free` for rating). Rate-limit/errors fall back to the built-in defaults in each function.

**Ollama (fully local, no API key):**
```json
"llm": { "provider": "ollama", "ollamaBaseUrl": "http://localhost:11434", "ollamaModel": "llama3.2" }
```

---

## Autonomous Mode

To skip the review step and have the agent apply automatically:

```json
"autoApply": true
```

The agent will still log everything to `localhost:3000/history` so you can see what was submitted.

---

## Data Location

All data is stored in `~/Documents/Job Hunter Pro/`:

```
~/Documents/Job Hunter Pro/
  job-hunter.db      SQLite database (profile, jobs, applications)
  cvs/               Tailored CV PDFs
  screenshots/       Auto-apply confirmation screenshots
```

---

## LinkedIn Note

LinkedIn's Terms of Service prohibit automated access. The agent mimics human browsing behavior. Use infrequent schedules (daily or less) to minimize the chance of your account being flagged. You accept this risk by using the LinkedIn search feature.

---

## Tech Stack

| Concern | Technology |
|---|---|
| Runtime | Node.js + TypeScript (tsx, no build step) |
| Database | SQLite (better-sqlite3) |
| LLM | Claude API, OpenRouter, or Ollama (configurable) |
| Job search | Playwright (Chromium) |
| Auto-apply | Playwright form automation |
| PDF generation | Playwright `page.pdf()` |
| Review UI | Express + plain HTML (no frontend framework) |
| Scheduling | node-cron |
| CV parsing | pdf-parse (PDF) + mammoth (DOCX) |

---

## License

MIT
