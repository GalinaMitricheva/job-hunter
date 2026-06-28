# Job Hunter Pro

A Windows desktop application that automates your job search — it stores your professional profile, runs scheduled searches on LinkedIn and company career pages, uses your local Ollama AI model to score matches and tailor your CV, and submits applications after you review and approve each one.

**All data stays on your machine. All AI runs locally via Ollama. No cloud required.**

---

## Features

- **Professional Profile** — Full work history, education, skills, certifications, and job preferences stored in local SQLite
- **Scheduled Job Search** — Searches LinkedIn and target company career pages on a configurable schedule (every 3h / 6h / 12h / daily / manual)
- **AI Relevance Scoring** — Each job is scored 0–100 by your local Ollama model with a short reasoning note
- **CV Tailoring** — Ollama rewrites your summary, reorders experience, and highlights matching skills for each role
- **Cover Letter Generation** — Tailored 3–4 paragraph cover letter per application
- **3 PDF CV Templates** — Classic (ATS-friendly), Modern (two-column), Minimal (clean typography)
- **Review Queue** — Three-column review: job description + tailored CV + cover letter side by side before you approve
- **Full Auto-Apply** — Playwright fills and submits the application form, attaches your CV, and saves a confirmation screenshot
- **History & Dashboard** — Searchable logs of every search and every application with CSV export
- **System Tray** — Runs in background, notifies you of high-relevance matches

---

## Prerequisites

Before running the app, make sure you have:

1. **Node.js 20+** — https://nodejs.org
2. **Ollama** — https://ollama.com (install and start it)
3. A language model pulled in Ollama — recommended:
   ```
   ollama pull llama3
   ```
   or `mistral`, `gemma3` for lighter hardware

---

## Setup

```bash
# Clone the repo
git clone https://github.com/GalinaMitricheva/job-hunter.git
cd job-hunter

# Install dependencies
npm install

# Install Playwright browsers (needed for LinkedIn search and auto-apply)
npx playwright install chromium
```

---

## Running in Development

```bash
npm run dev
```

This opens the Electron app in development mode with hot reload.

---

## Building for Windows

```bash
npm run package
```

This produces a Windows installer in the `dist/` folder.

---

## First Launch

On first launch, the app walks you through a setup wizard:

1. **Personal info** — name, email, phone, location, LinkedIn URL, professional summary
2. **Work experience** — your most recent role (add more in Profile later)
3. **Education** — degree, institution
4. **Skills** — technical skills, soft skills, tools
5. **Done** — ready to search

After onboarding:

1. Go to **Preferences** and set your target job titles (e.g. "Senior Software Engineer")
2. Go to **Settings** and add your LinkedIn credentials (encrypted on your machine) and target company career page URLs
3. Click **Run Search** in the sidebar

---

## Ollama Setup

The app connects to Ollama at `http://localhost:11434` by default. You can change this in Settings.

- Go to **Settings → Ollama AI Configuration** to test the connection and select which installed model to use
- If Ollama is offline, job search and manual editing still work — AI features (scoring, CV tailoring, cover letters) pause until Ollama is back

---

## LinkedIn Note

LinkedIn's Terms of Service prohibit automated access. The app mimics human browsing behavior to reduce detection risk. Use infrequent search schedules (daily or less) to minimize the chance of your account being flagged. You accept this risk by using the LinkedIn search feature.

---

## Data Location

All data (SQLite database, generated CVs, screenshots) is stored in:
- Windows: `%APPDATA%\job-hunter-pro\`

Use **Settings → Open Data Folder** to access it directly, or **Settings → Backup to ZIP** to export everything.

---

## Tech Stack

| Concern | Technology |
|---|---|
| App shell | Electron 29 |
| Frontend | React 18 + Vite + Tailwind CSS |
| Database | SQLite (better-sqlite3) |
| AI | Ollama local API (user's own models) |
| Job search | Playwright (Chromium) |
| Auto-apply | Playwright form automation |
| PDF generation | Electron's built-in printToPDF |
| Scheduling | node-cron |
| Credential storage | Electron safeStorage (OS-level encryption) |

---

## License

MIT
