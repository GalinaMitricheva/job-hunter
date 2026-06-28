import * as readline from 'readline'
import { getDb } from '../db'

interface Question {
  label: string
  dbField: string
  table: 'profile' | 'job_preferences'
  jsonField?: string
}

const PROFILE_QUESTIONS: Question[] = [
  { label: 'Full name', dbField: 'full_name', table: 'profile' },
  { label: 'Email', dbField: 'email', table: 'profile' },
  { label: 'Phone', dbField: 'phone', table: 'profile' },
  { label: 'Location (city, country)', dbField: 'location', table: 'profile' },
  { label: 'LinkedIn URL', dbField: 'linkedin_url', table: 'profile' },
  { label: 'GitHub URL', dbField: 'github_url', table: 'profile' },
  { label: 'Website URL', dbField: 'website_url', table: 'profile' },
  { label: 'Professional summary (2-3 sentences)', dbField: 'summary', table: 'profile' }
]

const PREFS_QUESTIONS: Question[] = [
  { label: 'Target job titles (comma-separated)', dbField: 'target_titles', table: 'job_preferences', jsonField: 'array' },
  { label: 'Target industries (comma-separated, or leave blank)', dbField: 'target_industries', table: 'job_preferences', jsonField: 'array' },
  { label: 'Location preference (Remote / Hybrid / On-site)', dbField: 'location_type', table: 'job_preferences' },
  { label: 'Preferred locations (comma-separated, or leave blank)', dbField: 'preferred_locations', table: 'job_preferences', jsonField: 'array' },
  { label: 'Seniority level (Junior / Mid / Senior / Lead / Director)', dbField: 'seniority_level', table: 'job_preferences' },
  { label: 'Minimum salary (number, or leave blank)', dbField: 'salary_min', table: 'job_preferences' },
  { label: 'Salary currency (USD / EUR / GBP / etc.)', dbField: 'salary_currency', table: 'job_preferences' },
  { label: 'Keywords to exclude from results (comma-separated, or leave blank)', dbField: 'exclude_keywords', table: 'job_preferences', jsonField: 'array' },
  { label: 'Companies to exclude (comma-separated, or leave blank)', dbField: 'exclude_companies', table: 'job_preferences', jsonField: 'array' }
]

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

export async function runProfileQuiz(onlyMissing = true, forcedFields: string[] = []): Promise<void> {
  const db = getDb()
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as Record<string, unknown>
  const prefs = db.prepare('SELECT * FROM job_preferences WHERE id = 1').get() as Record<string, unknown>

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log('\n=== Profile Setup ===')
  console.log('Press Enter to keep existing values shown in [brackets].\n')

  for (const q of PROFILE_QUESTIONS) {
    const current = profile[q.dbField] as string | null
    const isMissing = !current || current.trim() === ''
    const isForced = forcedFields.includes(q.dbField)

    if (onlyMissing && !isMissing && !isForced) continue

    const display = current ? ` [${current.substring(0, 60)}]` : ''
    const answer = await ask(rl, `${q.label}${display}: `)
    const value = answer.trim() || current || null

    if (value !== current) {
      db.prepare(`UPDATE profile SET ${q.dbField} = ?, updated_at = datetime('now') WHERE id = 1`).run(value)
    }
  }

  console.log('\n=== Job Preferences ===\n')

  for (const q of PREFS_QUESTIONS) {
    const rawCurrent = prefs[q.dbField]
    let currentDisplay: string
    let currentValue: string | null

    if (q.jsonField === 'array') {
      const arr = JSON.parse(String(rawCurrent || '[]')) as string[]
      currentDisplay = arr.join(', ')
      currentValue = arr.length > 0 ? currentDisplay : null
    } else {
      currentDisplay = String(rawCurrent || '')
      currentValue = currentDisplay || null
    }

    const isMissing = !currentValue
    if (onlyMissing && !isMissing) continue

    const display = currentValue ? ` [${currentDisplay.substring(0, 60)}]` : ''
    const answer = await ask(rl, `${q.label}${display}: `)
    const raw = answer.trim() || currentDisplay

    if (!raw) continue

    let dbValue: string
    if (q.jsonField === 'array') {
      dbValue = JSON.stringify(raw.split(',').map((s) => s.trim()).filter(Boolean))
    } else {
      dbValue = raw
    }

    db.prepare(`UPDATE job_preferences SET ${q.dbField} = ? WHERE id = 1`).run(dbValue)
  }

  db.prepare(`UPDATE profile SET onboarding_complete = 1, updated_at = datetime('now') WHERE id = 1`).run()
  rl.close()
  console.log('\nProfile saved.\n')
}
