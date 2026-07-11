import { writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { getDb } from '../db/index.ts'
import { getConfig } from '../config.ts'
import { applyPreFilters, makeLocationChecker } from '../search/filters.ts'
import { scoreJobRelevance } from '../llm/index.ts'

export interface EvalJob {
  id: number
  source: string
  company: string
  title: string
  location: string
  job_description: string
  agent_score: number
  agent_reasoning: string
  status: string
}

export interface EvalProfile {
  full_name: string
  summary: string
  location: string
  languages: Array<{ language: string; proficiency: string }>
  location_type: string
  target_titles: string[]
  fit_score_threshold: number
  skills: Array<{ name: string; category: string; proficiency: string }>
  work_experience: Array<{
    company: string; title: string; location: string
    start_date: string; end_date: string | null; is_current: boolean; description: string
  }>
  education: Array<{ institution: string; degree: string; field_of_study: string | null; graduation_year: string }>
}

export interface EvalExport {
  exported_at: string
  profile: EvalProfile
  jobs: EvalJob[]
}

export function exportEvalData(count: number, outputPath?: string): string {
  const db = getDb()

  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as Record<string, unknown>
  const prefs = db.prepare('SELECT * FROM job_preferences WHERE id = 1').get() as Record<string, unknown>
  const skills = db.prepare('SELECT name, category, proficiency FROM skills ORDER BY sort_order').all() as Array<{ name: string; category: string; proficiency: string }>
  const work = db.prepare('SELECT company, title, location, start_date, end_date, is_current, description FROM work_experience ORDER BY sort_order').all() as Array<Record<string, unknown>>
  const education = db.prepare('SELECT institution, degree, field_of_study, graduation_year FROM education ORDER BY sort_order').all() as Array<Record<string, unknown>>

  const jobs = db.prepare(`
    SELECT id, source, company, title, location,
           job_description, relevance_score as agent_score,
           relevance_reasoning as agent_reasoning, status
    FROM job_results
    WHERE status = 'scored' AND relevance_score IS NOT NULL
    ORDER BY found_at DESC
    LIMIT ?
  `).all(count) as EvalJob[]

  if (jobs.length === 0) {
    throw new Error('No scored jobs found in database. Run a search first.')
  }

  const evalExport: EvalExport = {
    exported_at: new Date().toISOString(),
    profile: {
      full_name: String(profile.full_name || ''),
      summary: String(profile.summary || ''),
      location: String(profile.location || ''),
      languages: JSON.parse(String(profile.languages || '[]')),
      location_type: String(prefs.location_type || 'Remote, hybrid'),
      target_titles: JSON.parse(String(prefs.target_titles || '[]')),
      fit_score_threshold: getConfig().search.fitScoreThreshold,
      skills,
      work_experience: work as EvalProfile['work_experience'],
      education: education as EvalProfile['education'],
    },
    jobs,
  }

  const filePath = outputPath || join(process.cwd(), 'eval-input.json')
  writeFileSync(filePath, JSON.stringify(evalExport, null, 2), 'utf-8')

  return filePath
}

export interface GoldenGroundTruth {
  should_pass: boolean
  filter_expected: string | null
  category: string
  notes: string
}

export interface GoldenJob {
  id: string
  source: string
  title: string
  company: string
  location: string
  job_description: string
  ground_truth: GoldenGroundTruth
}

export interface GoldenFilterResult {
  id: string
  title: string
  company: string
  filter_result: string
  expected_should_pass: boolean
  actual_should_pass: boolean
  correct: boolean
  filter_expected: string | null
  category: string
  notes: string
}

export function evaluateGoldenFilters(outputPath?: string): { filePath: string; report: string } {
  const db = getDb()
  const prefs = db.prepare('SELECT * FROM job_preferences WHERE id = 1').get() as Record<string, unknown>
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as Record<string, unknown>

  const locationType = String(prefs.location_type || 'Remote, hybrid').toLowerCase()
  const homeCity = String(profile.location || '').toLowerCase().split(',')[0].trim()
  const locationAccepted = makeLocationChecker(
    locationType.includes('remote'),
    locationType.includes('hybrid'),
    homeCity
  )

  const datasetPath = join(process.cwd(), 'eval-golden.json')
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8')) as { jobs: GoldenJob[] }

  const results: GoldenFilterResult[] = dataset.jobs.map((job) => {
    const filterResult = applyPreFilters(job.title, job.job_description, job.location, locationAccepted)
    const actualShouldPass = filterResult === 'pass'
    const expectedShouldPass = job.ground_truth.should_pass

    // For golden entries that should reach LLM (filter_expected is null or 'llm-score-low'),
    // the filter pipeline should return 'pass' — the LLM decides the final score.
    // For 'llm-score-low', filter passes but LLM scores below threshold.
    const filterLevelExpectedPass = job.ground_truth.filter_expected === null || job.ground_truth.filter_expected === 'llm-score-low'

    return {
      id: job.id,
      title: job.title,
      company: job.company,
      filter_result: filterResult,
      expected_should_pass: expectedShouldPass,
      actual_should_pass: actualShouldPass,
      correct: actualShouldPass === filterLevelExpectedPass,
      filter_expected: job.ground_truth.filter_expected,
      category: job.ground_truth.category,
      notes: job.ground_truth.notes,
    }
  })

  // Summary by filter
  const total = results.length
  const correct = results.filter((r) => r.correct).length
  const wrong = results.filter((r) => !r.correct)

  const byFilter: Record<string, { total: number; correct: number }> = {}
  for (const r of results) {
    const key = r.filter_expected || 'pass-to-llm'
    if (!byFilter[key]) byFilter[key] = { total: 0, correct: 0 }
    byFilter[key].total++
    if (r.correct) byFilter[key].correct++
  }

  const lines: string[] = [
    `Golden Filter Accuracy Report`,
    `Evaluated: ${new Date().toISOString()}`,
    ``,
    `Overall: ${correct}/${total} correct (${Math.round(correct / total * 100)}%)`,
    ``,
    `By expected outcome:`,
  ]
  for (const [key, counts] of Object.entries(byFilter).sort()) {
    lines.push(`  ${key.padEnd(20)} ${counts.correct}/${counts.total} correct`)
  }

  if (wrong.length > 0) {
    lines.push(``, `Misclassified entries:`)
    for (const r of wrong) {
      lines.push(`  [${r.id}] ${r.title} @ ${r.company}`)
      lines.push(`    Expected: filter=${r.filter_expected ?? 'none'}, should_pass=${r.expected_should_pass}`)
      lines.push(`    Got:      filter=${r.filter_result}, passes=${r.actual_should_pass}`)
    }
  } else {
    lines.push(``, `All entries correctly classified by pre-filters!`)
  }

  const report = lines.join('\n')
  const exportData = {
    evaluated_at: new Date().toISOString(),
    accuracy: { correct, total, pct: Math.round(correct / total * 100) },
    by_filter: byFilter,
    misclassified: wrong,
    all_results: results,
  }

  const filePath = outputPath || join(process.cwd(), 'eval-golden-results.json')
  writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8')

  return { filePath, report }
}

export interface GoldenScoringResult {
  id: string
  title: string
  company: string
  category: string
  score: number
  reasoning: string
  expected_pass: boolean
  actual_pass: boolean
  correct: boolean
}

/**
 * Scores every golden job that is meant to reach the LLM (pre-filter verdict
 * null or 'llm-score-low') through the configured LLM provider, then compares
 * score >= fitScoreThreshold against ground_truth.should_pass. Unlike
 * evaluateGoldenFilters (which only exercises the pre-filters), this makes real
 * LLM calls, so it measures a specific model's scoring quality — use it to pick
 * the OpenRouter default. Runs sequentially to stay under free-tier rate limits.
 */
export async function evaluateGoldenScoring(outputPath?: string): Promise<{ filePath: string; report: string }> {
  const db = getDb()
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as Record<string, unknown>
  const prefs = db.prepare('SELECT * FROM job_preferences WHERE id = 1').get() as Record<string, unknown>
  const skills = db.prepare('SELECT name FROM skills ORDER BY sort_order').all() as Array<{ name: string }>
  const work = db.prepare('SELECT title, company, start_date, end_date FROM work_experience ORDER BY sort_order').all() as Array<Record<string, unknown>>

  const threshold = getConfig().search.fitScoreThreshold
  const targetTitles = JSON.parse(String(prefs.target_titles || '[]')) as string[]
  const languages = JSON.parse(String(profile.languages || '[]')) as Array<{ language: string; proficiency: string }>
  const locationType = String(prefs.location_type || 'Remote, hybrid')
  const homeCity = String(profile.location || '').split(',')[0].trim()
  const profileSummary = String(profile.summary || '')
  const skillNames = skills.map((s) => s.name)

  const datasetPath = join(process.cwd(), 'eval-golden.json')
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8')) as { jobs: GoldenJob[] }

  // Only jobs the pipeline routes to the LLM: pre-filter passes, LLM decides.
  const llmJobs = dataset.jobs.filter(
    (j) => j.ground_truth.filter_expected === null || j.ground_truth.filter_expected === 'llm-score-low'
  )

  const model = getConfig().llm.provider === 'openrouter'
    ? getConfig().llm.openrouterRatingModel
    : getConfig().llm.provider

  const results: GoldenScoringResult[] = []
  for (const [i, job] of llmJobs.entries()) {
    // Pace calls to stay under free-tier per-minute limits (~20 req/min).
    if (i > 0) await new Promise((r) => setTimeout(r, 1500))
    const { score, reasoning } = await scoreJobRelevance(
      job.title, job.job_description, profileSummary, skillNames, targetTitles,
      work, languages, locationType, homeCity
    )
    const actualPass = score >= threshold
    const expectedPass = job.ground_truth.should_pass
    results.push({
      id: job.id, title: job.title, company: job.company, category: job.ground_truth.category,
      score, reasoning, expected_pass: expectedPass, actual_pass: actualPass,
      correct: actualPass === expectedPass,
    })
  }

  const total = results.length
  const correct = results.filter((r) => r.correct).length
  const wrong = results.filter((r) => !r.correct)
  // Split accuracy by direction so we see false-positives vs false-negatives.
  const shouldPass = results.filter((r) => r.expected_pass)
  const shouldFail = results.filter((r) => !r.expected_pass)
  const passAcc = shouldPass.filter((r) => r.correct).length
  const failAcc = shouldFail.filter((r) => r.correct).length

  const lines: string[] = [
    `Golden LLM Scoring Report`,
    `Evaluated: ${new Date().toISOString()}`,
    `Model: ${model} (threshold ${threshold})`,
    ``,
    `Overall: ${correct}/${total} correct (${Math.round(correct / total * 100)}%)`,
    `  Should pass (score >= ${threshold}): ${passAcc}/${shouldPass.length} correct`,
    `  Should score low (< ${threshold}):   ${failAcc}/${shouldFail.length} correct`,
  ]
  if (wrong.length > 0) {
    lines.push(``, `Misclassified:`)
    for (const r of wrong) {
      lines.push(`  [${r.id}] ${r.title} @ ${r.company} — scored ${r.score}, expected ${r.expected_pass ? 'pass' : 'low'} (${r.category})`)
    }
  }

  const report = lines.join('\n')
  const exportData = {
    evaluated_at: new Date().toISOString(),
    model,
    threshold,
    accuracy: { correct, total, pct: Math.round(correct / total * 100) },
    by_direction: {
      should_pass: { correct: passAcc, total: shouldPass.length },
      should_score_low: { correct: failAcc, total: shouldFail.length },
    },
    results,
  }

  const filePath = outputPath || join(process.cwd(), 'eval-golden-scoring-results.json')
  writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8')

  return { filePath, report }
}
