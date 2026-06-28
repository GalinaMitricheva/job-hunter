import { ipcMain } from 'electron'
import { getDb } from '../db'
import { searchLinkedIn, LinkedInError } from '../services/linkedin'
import { scrapeCompanyCareerPage } from '../services/company-scraper'
import { scoreJobRelevance } from '../services/ollama'

export interface SourceError {
  source: string
  error: string
  type: string
}

export async function runSearch(): Promise<{ searchRunId: number; newResults: any[]; sourceErrors: SourceError[] }> {
  const db = getDb()

  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as any
  const skills = db.prepare('SELECT name FROM skills').all() as any[]
  const prefs = db.prepare('SELECT * FROM job_preferences WHERE id = 1').get() as any
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any

  const targetTitles: string[] = JSON.parse(prefs?.target_titles || '[]')
  const includeKeywords: string[] = JSON.parse(prefs?.include_keywords || '[]')
  const companyUrls: string[] = JSON.parse(settings?.company_urls || '[]')
  const headless = settings?.headless_browser !== 0

  const query = [...targetTitles, ...includeKeywords].slice(0, 3).join(' ') || 'Software Engineer'
  const location = (JSON.parse(prefs?.preferred_locations || '[]')[0]) || prefs?.location_type || 'Remote'

  const searchRunResult = db.prepare(`
    INSERT INTO search_runs (sources, query_used, status)
    VALUES (?, ?, 'running')
  `).run(JSON.stringify(['linkedin', ...companyUrls]), query)

  const searchRunId = searchRunResult.lastInsertRowid as number
  const newResults: any[] = []
  const sourceErrors: SourceError[] = []

  try {
    let allJobs: any[] = []

    try {
      const linkedinJobs = await searchLinkedIn(query, location, headless)
      allJobs = [...allJobs, ...linkedinJobs.map((j) => ({ ...j, source: 'linkedin' }))]
    } catch (err) {
      if (err instanceof LinkedInError) {
        sourceErrors.push({ source: 'linkedin', error: err.message, type: err.type })
        console.error(`LinkedIn search blocked (${err.type}):`, err.message)
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown LinkedIn error'
        sourceErrors.push({ source: 'linkedin', error: msg, type: 'network' })
        console.error('LinkedIn search failed:', err)
      }
    }

    for (const url of companyUrls) {
      try {
        const jobs = await scrapeCompanyCareerPage(url, [...targetTitles, ...includeKeywords], headless)
        allJobs = [...allJobs, ...jobs.map((j) => ({ ...j, source: url }))]
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        sourceErrors.push({ source: url, error: msg, type: 'network' })
        console.error(`Company scrape failed for ${url}:`, err)
      }
    }

    const excludeKeywords: string[] = JSON.parse(prefs?.exclude_keywords || '[]')
    const excludeCompanies: string[] = JSON.parse(prefs?.exclude_companies || '[]')

    const filtered = allJobs.filter((job) => {
      if (excludeCompanies.some((c) => job.company.toLowerCase().includes(c.toLowerCase()))) return false
      const text = (job.title + ' ' + job.description).toLowerCase()
      if (excludeKeywords.some((k) => text.includes(k.toLowerCase()))) return false
      return true
    })

    for (const job of filtered) {
      const existing = db.prepare('SELECT id FROM job_results WHERE job_url = ?').get(job.url)
      if (existing) continue

      let score = 50
      let reasoning = 'Not evaluated (Ollama offline)'

      try {
        const result = await scoreJobRelevance(
          job.title,
          job.description || '',
          profile?.summary || '',
          skills.map((s) => s.name),
          targetTitles
        )
        score = result.score
        reasoning = result.reasoning
      } catch {}

      const insertResult = db.prepare(`
        INSERT INTO job_results (search_run_id, source, job_url, company, title, location, posted_date, job_description, relevance_score, relevance_reasoning)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(searchRunId, job.source, job.url, job.company, job.title, job.location, job.postedDate, job.description, score, reasoning)

      newResults.push({
        id: insertResult.lastInsertRowid,
        ...job,
        relevance_score: score,
        relevance_reasoning: reasoning,
        status: 'new'
      })
    }

    const finalStatus = sourceErrors.length > 0 && allJobs.length === 0 ? 'failed' : 'completed'

    db.prepare(`
      UPDATE search_runs SET completed_at=datetime('now'), total_found=?, new_results=?, status=?, source_errors=?
      WHERE id=?
    `).run(allJobs.length, newResults.length, finalStatus, JSON.stringify(sourceErrors), searchRunId)
  } catch (err) {
    db.prepare(`UPDATE search_runs SET status='failed', completed_at=datetime('now'), source_errors=? WHERE id=?`)
      .run(JSON.stringify(sourceErrors), searchRunId)
    throw err
  }

  return { searchRunId, newResults, sourceErrors }
}

export function registerSearchHandlers(): void {
  ipcMain.handle('search:run', async () => {
    return runSearch()
  })

  ipcMain.handle('search:results', (_, { limit = 50, status, minScore } = {}) => {
    const db = getDb()
    let sql = 'SELECT * FROM job_results WHERE 1=1'
    const params: any[] = []

    if (status) { sql += ' AND status = ?'; params.push(status) }
    if (minScore) { sql += ' AND relevance_score >= ?'; params.push(minScore) }
    sql += ' ORDER BY relevance_score DESC, found_at DESC LIMIT ?'
    params.push(limit)

    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('search:update-status', (_, { id, status }) => {
    const db = getDb()
    db.prepare('UPDATE job_results SET status = ? WHERE id = ?').run(status, id)
    return { success: true }
  })

  ipcMain.handle('search:history', () => {
    const db = getDb()
    const runs = db.prepare('SELECT * FROM search_runs ORDER BY started_at DESC LIMIT 50').all() as any[]
    return runs.map((run) => ({
      ...run,
      source_errors: JSON.parse(run.source_errors || '[]'),
      results: db.prepare('SELECT id, company, title, relevance_score, status FROM job_results WHERE search_run_id = ? ORDER BY relevance_score DESC').all(run.id)
    }))
  })

  ipcMain.handle('search:next-run', () => {
    const { getNextRunTime } = require('../services/scheduler')
    const db = getDb()
    const last = db.prepare('SELECT started_at, completed_at, status, new_results, source_errors FROM search_runs ORDER BY started_at DESC LIMIT 1').get() as any
    return {
      nextRun: getNextRunTime(),
      lastRun: last ? { ...last, source_errors: JSON.parse(last.source_errors || '[]') } : null
    }
  })

  ipcMain.handle('search:export-csv', () => {
    const db = getDb()
    const runs = db.prepare('SELECT * FROM search_runs ORDER BY started_at DESC').all() as any[]
    const headers = 'Run ID,Started At,Completed At,Query,Sources,Total Found,New Results,Status,Source Errors'
    const rows = runs.map((r) =>
      [r.id, r.started_at, r.completed_at, r.query_used, r.sources, r.total_found, r.new_results, r.status, r.source_errors || '[]']
        .map((v) => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',')
    )
    return [headers, ...rows].join('\n')
  })
}
