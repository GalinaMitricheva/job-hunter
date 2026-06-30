import { writeFileSync } from 'fs'
import { join } from 'path'
import { getDb } from '../db'
import { getConfig } from '../config'

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
