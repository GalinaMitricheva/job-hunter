import { readFileSync } from 'fs'

// Coerce any LLM output value to a type SQLite can bind
function s(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.join('\n')
  return String(v)
}
function n(v: unknown): number {
  if (typeof v === 'boolean') return v ? 1 : 0
  const num = Number(v)
  return isNaN(num) ? 0 : num
}
import { extname } from 'path'
import { getDb } from '../db'
import { parseProfileFromText } from '../llm'

export async function importCVFile(filePath: string): Promise<{ missingFields: string[] }> {
  const ext = extname(filePath).toLowerCase()
  let text: string

  if (ext === '.pdf') {
    text = await extractPdfText(filePath)
  } else if (ext === '.docx') {
    text = await extractDocxText(filePath)
  } else if (ext === '.txt') {
    text = readFileSync(filePath, 'utf-8')
  } else {
    throw new Error(`Unsupported file type: ${ext}. Supported: .pdf, .docx, .txt`)
  }

  console.log(`Parsing CV (${text.length} chars) with LLM...`)
  const parsed = await parseProfileFromText(text)
  saveProfileToDb(parsed, text)

  const missing: string[] = (parsed.missing_fields as string[]) || []
  return { missingFields: missing }
}

async function extractPdfText(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  const buffer = readFileSync(filePath)
  const data = await pdfParse(buffer)
  return data.text as string
}

async function extractDocxText(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require('mammoth')
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value as string
}

function saveProfileToDb(parsed: Record<string, unknown>, rawText: string): void {
  const db = getDb()

  const languages = Array.isArray(parsed.languages) ? parsed.languages : []
  db.prepare(`
    UPDATE profile SET
      full_name = ?, email = ?, phone = ?, location = ?,
      linkedin_url = ?, website_url = ?, github_url = ?,
      summary = ?, languages = ?, raw_cv_text = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(
    parsed.full_name || null,
    parsed.email || null,
    parsed.phone || null,
    parsed.location || null,
    parsed.linkedin_url || null,
    parsed.website_url || null,
    parsed.github_url || null,
    parsed.summary || null,
    JSON.stringify(languages),
    rawText
  )

  const work = ((parsed.work_experience as Array<Record<string, unknown>>) || [])
    .filter((e) => e.company && e.title)
  if (work.length > 0) {
    db.prepare('DELETE FROM work_experience').run()
    const insertExp = db.prepare(`
      INSERT INTO work_experience (company, title, location, start_date, end_date, is_current, description, achievements, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    work.forEach((e, i) => {
      insertExp.run(s(e.company), s(e.title), s(e.location), s(e.start_date) ?? '', s(e.end_date), n(e.is_current), s(e.description), s(e.achievements), i)
    })
  }

  const edu = ((parsed.education as Array<Record<string, unknown>>) || [])
    .filter((e) => e.institution && e.degree)
  if (edu.length > 0) {
    db.prepare('DELETE FROM education').run()
    const insertEdu = db.prepare(`
      INSERT INTO education (institution, degree, field_of_study, graduation_year, gpa, honors, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    edu.forEach((e, i) => {
      insertEdu.run(s(e.institution), s(e.degree), s(e.field_of_study), s(e.graduation_year), s(e.gpa), s(e.honors), i)
    })
  }

  const skillsList = ((parsed.skills as Array<Record<string, unknown>>) || [])
    .filter((s) => s.name)
  if (skillsList.length > 0) {
    db.prepare('DELETE FROM skills').run()
    const insertSkill = db.prepare(`
      INSERT INTO skills (name, category, proficiency, sort_order) VALUES (?, ?, ?, ?)
    `)
    skillsList.forEach((sk, i) => {
      insertSkill.run(s(sk.name), s(sk.category) ?? 'Technical', s(sk.proficiency) ?? 'Intermediate', i)
    })
  }

  const certs = (parsed.certifications as Array<Record<string, unknown>>) || []
  if (certs.length > 0) {
    db.prepare('DELETE FROM certifications').run()
    const insertCert = db.prepare(`INSERT INTO certifications (name, issuing_org, year, sort_order) VALUES (?, ?, ?, ?)`)
    certs.forEach((c, i) => insertCert.run(s(c.name), s(c.issuing_org), s(c.year), i))
  }

  const titles = (parsed.target_titles as string[]) || []
  if (titles.length > 0) {
    db.prepare(`
      INSERT OR REPLACE INTO job_preferences (id, target_titles) VALUES (1, ?)
    `).run(JSON.stringify(titles))
  }
}
