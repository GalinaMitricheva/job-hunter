import { readFileSync } from 'fs'
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

  db.prepare(`
    UPDATE profile SET
      full_name = ?, email = ?, phone = ?, location = ?,
      linkedin_url = ?, website_url = ?, github_url = ?,
      summary = ?, raw_cv_text = ?, updated_at = datetime('now')
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
      insertExp.run(e.company, e.title, e.location || null, e.start_date || '', e.end_date || null, e.is_current ? 1 : 0, e.description || null, e.achievements || null, i)
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
      insertEdu.run(e.institution, e.degree, e.field_of_study || null, e.graduation_year || null, e.gpa || null, e.honors || null, i)
    })
  }

  const skillsList = ((parsed.skills as Array<Record<string, unknown>>) || [])
    .filter((s) => s.name)
  if (skillsList.length > 0) {
    db.prepare('DELETE FROM skills').run()
    const insertSkill = db.prepare(`
      INSERT INTO skills (name, category, proficiency, sort_order) VALUES (?, ?, ?, ?)
    `)
    skillsList.forEach((s, i) => {
      insertSkill.run(s.name, s.category || 'Technical', s.proficiency || 'Intermediate', i)
    })
  }

  const certs = (parsed.certifications as Array<Record<string, unknown>>) || []
  if (certs.length > 0) {
    db.prepare('DELETE FROM certifications').run()
    const insertCert = db.prepare(`INSERT INTO certifications (name, issuing_org, year, sort_order) VALUES (?, ?, ?, ?)`)
    certs.forEach((c, i) => insertCert.run(c.name, c.issuing_org || null, c.year || null, i))
  }

  const titles = (parsed.target_titles as string[]) || []
  if (titles.length > 0) {
    db.prepare(`
      INSERT OR REPLACE INTO job_preferences (id, target_titles) VALUES (1, ?)
    `).run(JSON.stringify(titles))
  }
}
