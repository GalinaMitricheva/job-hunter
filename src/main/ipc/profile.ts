import { ipcMain } from 'electron'
import { getDb } from '../db'

function computeCompleteness(profile: any, workExperience: any[], education: any[], skills: any[]): { score: number; missing: string[] } {
  // Exactly the 7 required items; points sum to 100
  const checks: Array<{ label: string; points: number; met: boolean }> = [
    { label: 'Full name', points: 15, met: !!(profile?.full_name?.trim()) },
    { label: 'Email address', points: 10, met: !!(profile?.email?.trim()) },
    { label: 'Professional summary', points: 20, met: !!(profile?.summary?.trim()) },
    { label: 'Work experience', points: 20, met: workExperience.length > 0 },
    { label: 'Education', points: 15, met: education.length > 0 },
    { label: 'At least 5 skills', points: 15, met: skills.length >= 5 },
    { label: 'LinkedIn URL', points: 5, met: !!(profile?.linkedin_url?.trim()) }
  ]
  const score = checks.reduce((sum, c) => sum + (c.met ? c.points : 0), 0)
  const missing = checks.filter((c) => !c.met).map((c) => c.label)
  return { score, missing }
}

export function registerProfileHandlers(): void {
  ipcMain.handle('profile:completeness', () => {
    const db = getDb()
    const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as any
    const workExperience = db.prepare('SELECT id FROM work_experience').all()
    const education = db.prepare('SELECT id FROM education').all()
    const skills = db.prepare('SELECT id FROM skills').all()
    return computeCompleteness(profile, workExperience, education, skills)
  })

  ipcMain.handle('profile:get', () => {
    const db = getDb()
    const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get()
    const workExperience = db.prepare('SELECT * FROM work_experience ORDER BY sort_order, id').all()
    const education = db.prepare('SELECT * FROM education ORDER BY sort_order, id').all()
    const skills = db.prepare('SELECT * FROM skills ORDER BY sort_order, id').all()
    const certifications = db.prepare('SELECT * FROM certifications ORDER BY sort_order, id').all()
    const awards = db.prepare('SELECT * FROM awards ORDER BY sort_order, id').all()
    const preferences = db.prepare('SELECT * FROM job_preferences WHERE id = 1').get() as any

    return {
      profile,
      workExperience,
      education,
      skills,
      certifications,
      awards,
      preferences: preferences ? {
        ...preferences,
        target_titles: JSON.parse(preferences.target_titles || '[]'),
        target_industries: JSON.parse(preferences.target_industries || '[]'),
        preferred_locations: JSON.parse(preferences.preferred_locations || '[]'),
        employment_types: JSON.parse(preferences.employment_types || '["Full-time"]'),
        include_keywords: JSON.parse(preferences.include_keywords || '[]'),
        exclude_keywords: JSON.parse(preferences.exclude_keywords || '[]'),
        exclude_companies: JSON.parse(preferences.exclude_companies || '[]')
      } : null
    }
  })

  ipcMain.handle('profile:save-basic', (_, data) => {
    const db = getDb()
    db.prepare(`
      UPDATE profile SET
        full_name = ?, email = ?, phone = ?, location = ?,
        linkedin_url = ?, website_url = ?, github_url = ?, summary = ?,
        updated_at = datetime('now')
      WHERE id = 1
    `).run(data.full_name, data.email, data.phone, data.location,
           data.linkedin_url, data.website_url, data.github_url, data.summary)
    return { success: true }
  })

  ipcMain.handle('profile:complete-onboarding', () => {
    const db = getDb()
    db.prepare('UPDATE profile SET onboarding_complete = 1 WHERE id = 1').run()
    return { success: true }
  })

  ipcMain.handle('work-experience:save', (_, item) => {
    const db = getDb()
    if (item.id) {
      db.prepare(`
        UPDATE work_experience SET company=?, title=?, location=?, start_date=?, end_date=?,
        is_current=?, description=?, achievements=?, sort_order=? WHERE id=?
      `).run(item.company, item.title, item.location, item.start_date, item.end_date,
             item.is_current ? 1 : 0, item.description, item.achievements, item.sort_order || 0, item.id)
      return { id: item.id }
    } else {
      const result = db.prepare(`
        INSERT INTO work_experience (company, title, location, start_date, end_date, is_current, description, achievements, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(item.company, item.title, item.location, item.start_date, item.end_date,
             item.is_current ? 1 : 0, item.description, item.achievements, item.sort_order || 0)
      return { id: result.lastInsertRowid }
    }
  })

  ipcMain.handle('work-experience:delete', (_, id) => {
    const db = getDb()
    db.prepare('DELETE FROM work_experience WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('education:save', (_, item) => {
    const db = getDb()
    if (item.id) {
      db.prepare(`
        UPDATE education SET institution=?, degree=?, field_of_study=?, graduation_year=?, gpa=?, honors=?, sort_order=? WHERE id=?
      `).run(item.institution, item.degree, item.field_of_study, item.graduation_year, item.gpa, item.honors, item.sort_order || 0, item.id)
      return { id: item.id }
    } else {
      const result = db.prepare(`
        INSERT INTO education (institution, degree, field_of_study, graduation_year, gpa, honors, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(item.institution, item.degree, item.field_of_study, item.graduation_year, item.gpa, item.honors, item.sort_order || 0)
      return { id: result.lastInsertRowid }
    }
  })

  ipcMain.handle('education:delete', (_, id) => {
    const db = getDb()
    db.prepare('DELETE FROM education WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('skills:save', (_, item) => {
    const db = getDb()
    if (item.id) {
      db.prepare('UPDATE skills SET name=?, category=?, proficiency=?, sort_order=? WHERE id=?')
        .run(item.name, item.category, item.proficiency, item.sort_order || 0, item.id)
      return { id: item.id }
    } else {
      const result = db.prepare('INSERT INTO skills (name, category, proficiency, sort_order) VALUES (?, ?, ?, ?)')
        .run(item.name, item.category, item.proficiency, item.sort_order || 0)
      return { id: result.lastInsertRowid }
    }
  })

  ipcMain.handle('skills:delete', (_, id) => {
    const db = getDb()
    db.prepare('DELETE FROM skills WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('certifications:save', (_, item) => {
    const db = getDb()
    if (item.id) {
      db.prepare('UPDATE certifications SET name=?, issuing_org=?, year=?, sort_order=? WHERE id=?')
        .run(item.name, item.issuing_org, item.year, item.sort_order || 0, item.id)
      return { id: item.id }
    } else {
      const result = db.prepare('INSERT INTO certifications (name, issuing_org, year, sort_order) VALUES (?, ?, ?, ?)')
        .run(item.name, item.issuing_org, item.year, item.sort_order || 0)
      return { id: result.lastInsertRowid }
    }
  })

  ipcMain.handle('certifications:delete', (_, id) => {
    const db = getDb()
    db.prepare('DELETE FROM certifications WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('preferences:save', (_, data) => {
    const db = getDb()
    db.prepare(`
      UPDATE job_preferences SET
        target_titles=?, target_industries=?, location_type=?, preferred_locations=?,
        seniority_level=?, employment_types=?, salary_min=?, salary_max=?,
        salary_currency=?, include_keywords=?, exclude_keywords=?, exclude_companies=?,
        relevance_threshold=?
      WHERE id = 1
    `).run(
      JSON.stringify(data.target_titles || []),
      JSON.stringify(data.target_industries || []),
      data.location_type,
      JSON.stringify(data.preferred_locations || []),
      data.seniority_level,
      JSON.stringify(data.employment_types || []),
      data.salary_min || null,
      data.salary_max || null,
      data.salary_currency || 'USD',
      JSON.stringify(data.include_keywords || []),
      JSON.stringify(data.exclude_keywords || []),
      JSON.stringify(data.exclude_companies || []),
      data.relevance_threshold || 60
    )
    return { success: true }
  })
}
