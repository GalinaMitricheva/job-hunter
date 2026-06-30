import { getDb } from '../db'
import { getConfig } from '../config'
import { scoreJobRelevance, tailorCV, generateCoverLetter } from '../llm'
import { searchLinkedIn, LinkedInError } from '../services/linkedin'
import { scrapeCompanyCareerPage } from '../services/company-scraper'
import { generateCVPdf, CVData } from '../services/cv-generator'

interface SearchSummary {
  totalFound: number
  newResults: number
  queued: number
  errors: string[]
}

export async function runSearch(): Promise<SearchSummary> {
  const db = getDb()
  const cfg = getConfig()

  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as Record<string, unknown> & { languages?: string }
  const prefs = db.prepare('SELECT * FROM job_preferences WHERE id = 1').get() as Record<string, unknown>
  const workExperience = db.prepare('SELECT * FROM work_experience ORDER BY sort_order').all() as Array<Record<string, unknown>>
  const education = db.prepare('SELECT * FROM education ORDER BY sort_order').all() as Array<Record<string, unknown>>
  const skills = db.prepare('SELECT * FROM skills ORDER BY sort_order').all() as Array<{ id: number; name: string; category: string }>
  const certifications = db.prepare('SELECT * FROM certifications ORDER BY sort_order').all() as Array<Record<string, unknown>>

  const targetTitles: string[] = JSON.parse(String(prefs.target_titles || '[]'))
  const preferredLocations: string[] = JSON.parse(String(prefs.preferred_locations || '[]'))
  const excludeCompanies: string[] = JSON.parse(String(prefs.exclude_companies || '[]'))
  const threshold = cfg.search.fitScoreThreshold

  const runId = (db.prepare(`
    INSERT INTO search_runs (sources, query_used, status) VALUES (?, ?, 'running')
  `).run(JSON.stringify(['linkedin', 'company']), targetTitles.join(', ')).lastInsertRowid) as number

  const errors: string[] = []
  let totalFound = 0
  let newResults = 0
  let queued = 0

  // --- LinkedIn search ---
  if (!cfg.linkedin.enabled) {
    console.log('  LinkedIn search disabled (set linkedin.enabled=true in config.json to enable)')
  }
  const locations = preferredLocations.length > 0 ? preferredLocations : ['Remote']
  for (const title of cfg.linkedin.enabled ? targetTitles.slice(0, 3) : []) {
    for (const location of locations.slice(0, 2)) {
      try {
        console.log(`  Searching LinkedIn: "${title}" in "${location}"...`)
        const listings = await searchLinkedIn(title, location, cfg.search.headlessBrowser)
        totalFound += listings.length
        for (const job of listings) {
          if (excludeCompanies.some((c) => job.company.toLowerCase().includes(c.toLowerCase()))) continue
          const inserted = tryInsertJob(db, runId, 'linkedin', job)
          if (inserted) newResults++
        }
      } catch (err) {
        const msg = err instanceof LinkedInError ? `LinkedIn: ${err.message}` : `LinkedIn search error: ${String(err)}`
        errors.push(msg)
        console.warn(' ', msg)
      }
    }
  }

  // --- Company career pages ---
  const includeKeywords: string[] = JSON.parse(String(prefs.include_keywords || '[]'))
  for (const url of cfg.search.companyUrls) {
    console.log(`  Scraping ${url}...`)
    try {
      const scrapeWithTimeout = Promise.race([
        scrapeCompanyCareerPage(url, [...targetTitles, ...includeKeywords], cfg.search.headlessBrowser),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timed out after 60s')), 60_000))
      ])
      const jobs = await scrapeWithTimeout
      console.log(`    → ${jobs.length} job(s) found`)
      totalFound += jobs.length
      for (const job of jobs) {
        if (excludeCompanies.some((c) => job.company.toLowerCase().includes(c.toLowerCase()))) continue
        const inserted = tryInsertJob(db, runId, 'company', job)
        if (inserted) newResults++
      }
    } catch (err) {
      const msg = `Scrape failed (${url}): ${String(err)}`
      errors.push(msg)
      console.warn(`    → ${msg}`)
    }
  }

  // --- Score and queue new results ---
  const newJobs = db.prepare(`SELECT * FROM job_results WHERE search_run_id = ? AND status = 'new'`).all(runId) as Array<Record<string, unknown>>

  const TOO_JUNIOR = /\b(intern|internship|entry.?level|junior|graduate|trainee|apprentice|student)\b/i
  const languages: Array<{ language: string; proficiency: string }> = JSON.parse(profile.languages || '[]')

  for (const job of newJobs) {
    const titleStr = String(job.title)
    if (TOO_JUNIOR.test(titleStr)) {
      console.log(`  Skipping (too junior): ${titleStr} at ${job.company}`)
      db.prepare(`UPDATE job_results SET relevance_score = 0, relevance_reasoning = 'Role is below candidate seniority level', status = 'scored' WHERE id = ?`).run(job.id)
      continue
    }

    console.log(`  Scoring: ${titleStr} at ${job.company}...`)
    const { score, reasoning, missingRequirements } = await scoreJobRelevance(
      String(job.title),
      String(job.job_description || ''),
      String(profile.summary || ''),
      skills.map((s) => s.name),
      targetTitles,
      workExperience,
      languages
    )


    if (missingRequirements.length > 0) {
      console.log(`    Missing: ${missingRequirements.join('; ')}`)
    }

    db.prepare(`UPDATE job_results SET relevance_score = ?, relevance_reasoning = ?, status = 'scored' WHERE id = ?`).run(score, reasoning, job.id)

    if (score >= threshold) {
      console.log(`  Tailoring CV for score ${score}: ${job.title} at ${job.company}...`)
      await queueApplication(db, job, profile, workExperience, education, skills, certifications, score)
      queued++
    }
  }

  db.prepare(`UPDATE search_runs SET completed_at = datetime('now'), total_found = ?, new_results = ?, status = 'complete', source_errors = ? WHERE id = ?`)
    .run(totalFound, newResults, JSON.stringify(errors), runId)

  return { totalFound, newResults, queued, errors }
}

function tryInsertJob(db: ReturnType<typeof getDb>, runId: number, source: string, job: { url: string; company: string; title: string; location: string; postedDate: string; description: string }): boolean {
  try {
    db.prepare(`
      INSERT INTO job_results (search_run_id, source, job_url, company, title, location, posted_date, job_description, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')
    `).run(runId, source, job.url, job.company, job.title, job.location, job.postedDate, job.description)
    return true
  } catch {
    return false // UNIQUE constraint = already seen
  }
}

async function queueApplication(
  db: ReturnType<typeof getDb>,
  job: Record<string, unknown>,
  profile: Record<string, unknown>,
  workExperience: Array<Record<string, unknown>>,
  education: Array<Record<string, unknown>>,
  skills: Array<{ name: string }>,
  certifications: Array<Record<string, unknown>>,
  _score: number
): Promise<void> {
  const { tailoredSummary, highlightedSkills, reorderedExperience } = await tailorCV(
    profile, workExperience, skills, String(job.title), String(job.job_description || '')
  )

  const coverLetter = await generateCoverLetter(
    String(profile.full_name || ''),
    String(job.title),
    String(job.company),
    String(job.job_description || ''),
    tailoredSummary
  )

  const appId = (db.prepare(`
    INSERT INTO applications (job_result_id, company, title, job_url, job_description, cover_letter, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending_review')
  `).run(job.id, job.company, job.title, job.job_url, job.job_description, coverLetter).lastInsertRowid) as number

  const cvData: CVData = {
    profile, workExperience, education, skills, certifications,
    tailoredSummary, highlightedSkills, reorderedExperience
  }

  const pdfPath = await generateCVPdf(cvData, 'classic', appId)

  const cvVersionId = (db.prepare(`
    INSERT INTO cv_versions (application_id, template, tailored_summary, tailored_content, pdf_path)
    VALUES (?, 'classic', ?, ?, ?)
  `).run(appId, tailoredSummary, JSON.stringify({ highlightedSkills, reorderedExperience }), pdfPath).lastInsertRowid) as number

  db.prepare('UPDATE applications SET cv_version_id = ? WHERE id = ?').run(cvVersionId, appId)
}
