import { getDb } from '../db'
import { getConfig } from '../config'
import { scoreJobRelevance, tailorCV, generateCoverLetter } from '../llm'
import { searchLinkedIn, LinkedInError } from '../services/linkedin'
import { scrapeCompanyCareerPage } from '../services/company-scraper'
import { searchJobBoards } from '../services/job-boards'
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

  // --- Job board search ---
  const jbCfg = cfg.search.jobBoards
  if (jbCfg?.enabled) {
    console.log(`  Searching job boards: ${jbCfg.sites.join(', ')}...`)
    try {
      const boardJobs = await searchJobBoards(
        targetTitles,
        jbCfg.locations.length > 0 ? jbCfg.locations : ['Munich', 'Remote'],
        jbCfg.sites,
        cfg.search.headlessBrowser
      )
      totalFound += boardJobs.length
      for (const job of boardJobs) {
        if (excludeCompanies.some((c) => job.company.toLowerCase().includes(c.toLowerCase()))) continue
        const inserted = tryInsertJob(db, runId, 'jobboard', job)
        if (inserted) newResults++
      }
    } catch (err) {
      const msg = `Job board search failed: ${String(err)}`
      errors.push(msg)
      console.warn(`    → ${msg}`)
    }
  } else {
    console.log('  Job board search disabled (set search.jobBoards.enabled=true in config.json to enable)')
  }

  // --- Score and queue new results ---
  const newJobs = db.prepare(`SELECT * FROM job_results WHERE search_run_id = ? AND status = 'new'`).all(runId) as Array<Record<string, unknown>>

  const TOO_JUNIOR = /\b(intern|internship|entry.?level|junior|graduate|trainee|apprentice|student|early.?career)\b/i

  // Titles that clearly belong to a different job function — not PM/product leadership
  const WRONG_FUNCTION = /\b(engineer|engineering|developer|devops|sre|security|cloud|backend|frontend|fullstack|full.?stack|firmware|hardware|soc|chip|calibrat|assembly|technician|lawyer|jurist|counsel|legal|accounting|accountant|revenue accounting|controller|finance|audit|sales director|sales manager|account executive|account manager|business development|field engineer|solutions engineer|customer success|customer support|it director|it manager|business systems|revenue operations|revops)\b/i
  // But if the title also contains PM/product/lead keywords, let it through (e.g. "Product Manager, Cloud Platform")
  const PM_SIGNAL = /\b(product manager|product lead|product owner|head of product|vp of product|director of product|group pm|principal pm|chief product|cpo|program manager|technical pm|product strategy)\b/i

  const languages: Array<{ language: string; proficiency: string }> = JSON.parse(profile.languages || '[]')
  const locationType = String(prefs.location_type || 'Remote, hybrid').toLowerCase()
  const acceptsRemote = locationType.includes('remote')
  const acceptsHybrid = locationType.includes('hybrid')
  const homeCity = String(profile.location || '').toLowerCase().split(',')[0].trim() // "munich"
  const homeCountry = 'germany'

  // Locations that signal a role outside EU / candidate's reach
  const NON_EU_LOCATION = /\b(united states|usa|\bU\.S\.?\b|california|new york|san francisco|seattle|austin|boston|chicago|los angeles|texas|florida|washington d\.?c|virginia|colorado|arizona|utah|wyoming|new mexico|oregon|illinois|georgia|ohio|pennsylvania|michigan|north carolina|south carolina|new jersey|connecticut|massachusetts|maryland|nevada|minnesota|wisconsin|missouri|indiana|alabama|tennessee|kentucky|oklahoma|louisiana|arkansas|mississippi|kansas|iowa|nebraska|south dakota|north dakota|idaho|montana|alaska|hawaii|singapore|tokyo|japan|sydney|australia|canada|toronto|vancouver|india|bangalore|hyderabad|brazil|mexico|china|beijing|shanghai|dubai|uae|south korea|seoul)\b/i

  function locationAccepted(jobLocationRaw: string, descriptionRaw: string): boolean {
    const loc = jobLocationRaw.toLowerCase()
    // Check location field + first 500 chars of description for non-EU signals
    const locAndOpening = (loc + ' ' + descriptionRaw.substring(0, 500)).toLowerCase()
    if (NON_EU_LOCATION.test(locAndOpening)) return false

    const combined = (loc + ' ' + descriptionRaw.substring(0, 2000)).toLowerCase()
    // Accept remote or hybrid
    if (acceptsRemote && /\bremote\b/.test(combined)) return true
    if (acceptsHybrid && /\bhybrid\b/.test(combined)) return true
    // Accept on-site in candidate's city or country
    if (homeCity && combined.includes(homeCity)) return true
    if (combined.includes(homeCountry)) return true
    // Blank location with no red flags — let LLM decide
    if (!jobLocationRaw.trim()) return true
    return false
  }

  function isJobPosting(title: string, description: string): boolean {
    const t = title.toLowerCase()
    const d = description.toLowerCase().substring(0, 1000)
    // Obvious non-job page patterns in the title
    if (/^(blog|home|search jobs|jobs?$|engineering$|careers?$|spotlight|rovo|newsletter|about|news|press|analyst reports?|leadership|products?$|platform$|security$|pricing$|ai agent)/i.test(title.trim())) return false
    // Must have at least one job-posting marker in the description
    const markers = ['responsibilit', 'requirement', 'qualif', 'apply', 'we are looking', 'you will', 'your role', 'what you', 'job description', 'about the role', 'we\'re looking', 'the opportunity', 'who you are', 'what we\'re looking']
    return markers.some((m) => t.includes(m) || d.includes(m))
  }

  for (const job of newJobs) {
    const titleStr = String(job.title)
    const jobDesc = String(job.job_description || '')

    // Fix 3: reject non-job pages
    if (!isJobPosting(titleStr, jobDesc)) {
      console.log(`  Skipping (not a job posting): ${titleStr} at ${job.company}`)
      db.prepare(`UPDATE job_results SET relevance_score = 0, relevance_reasoning = 'Page is not a job posting', status = 'scored' WHERE id = ?`).run(job.id)
      continue
    }

    // Fix 1: reject wrong job function
    if (WRONG_FUNCTION.test(titleStr) && !PM_SIGNAL.test(titleStr)) {
      console.log(`  Skipping (wrong function): ${titleStr} at ${job.company}`)
      db.prepare(`UPDATE job_results SET relevance_score = 0, relevance_reasoning = 'Role function does not match candidate profile (not a PM/product role)', status = 'scored' WHERE id = ?`).run(job.id)
      continue
    }

    if (TOO_JUNIOR.test(titleStr)) {
      console.log(`  Skipping (too junior): ${titleStr} at ${job.company}`)
      db.prepare(`UPDATE job_results SET relevance_score = 0, relevance_reasoning = 'Role is below candidate seniority level', status = 'scored' WHERE id = ?`).run(job.id)
      continue
    }

    // Fix 2: improved location filter (US detection + country-level matching)
    const jobLocation = String(job.location || '')
    if (!locationAccepted(jobLocation, jobDesc)) {
      console.log(`  Skipping (location mismatch): ${titleStr} at ${job.company} [${jobLocation || 'no location'}]`)
      db.prepare(`UPDATE job_results SET relevance_score = 0, relevance_reasoning = 'Location does not match candidate preferences (remote/hybrid/Munich)', status = 'scored' WHERE id = ?`).run(job.id)
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
      languages,
      String(prefs.location_type || 'Remote, hybrid'),
      homeCity || 'Munich'
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
