import { ipcMain, shell } from 'electron'
import { getDb } from '../db'
import { tailorCV, generateCoverLetter } from '../services/ollama'
import { generateCVPdf, getCVHtml } from '../services/cv-generator'
import { submitApplication } from '../services/auto-apply'
import { notifyQueueUpdate } from '../notify'

async function buildCVData(profile: any, workExperience: any[], education: any[], skills: any[], certifications: any[], tailoredSummary: string, highlightedSkills: string[], reorderedExperience: number[]) {
  const orderedExp = reorderedExperience.length > 0
    ? reorderedExperience.map((id) => workExperience.find((e: any) => e.id === id)).filter(Boolean)
    : workExperience

  return { profile, workExperience: orderedExp, education, skills, certifications, tailoredSummary, highlightedSkills }
}

export function registerApplicationHandlers(): void {
  ipcMain.handle('queue:add', async (_, jobResultId: number) => {
    const db = getDb()
    const job = db.prepare('SELECT * FROM job_results WHERE id = ?').get(jobResultId) as any
    if (!job) return { error: 'Job not found' }

    const existing = db.prepare('SELECT id FROM applications WHERE job_result_id = ?').get(jobResultId)
    if (existing) return { error: 'Already in queue', existing }

    const result = db.prepare(`
      INSERT INTO applications (job_result_id, company, title, job_url, job_description, status)
      VALUES (?, ?, ?, ?, ?, 'pending_review')
    `).run(jobResultId, job.company, job.title, job.job_url, job.job_description)

    const applicationId = result.lastInsertRowid as number

    db.prepare('UPDATE job_results SET status = ? WHERE id = ?').run('queued', jobResultId)

    const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as any
    const workExperience = db.prepare('SELECT * FROM work_experience ORDER BY sort_order, id').all() as any[]
    const education = db.prepare('SELECT * FROM education ORDER BY sort_order, id').all() as any[]
    const skills = db.prepare('SELECT * FROM skills ORDER BY sort_order, id').all() as any[]
    const certifications = db.prepare('SELECT * FROM certifications ORDER BY sort_order, id').all() as any[]
    const settings = db.prepare('SELECT cv_template FROM settings WHERE id = 1').get() as any

    let tailoredSummary = profile?.summary || ''
    let highlightedSkills: string[] = []
    let reorderedExperience: number[] = []

    try {
      const tailored = await tailorCV(profile, workExperience, education, skills, job.title, job.job_description || '')
      tailoredSummary = tailored.tailoredSummary
      highlightedSkills = tailored.highlightedSkills
      reorderedExperience = tailored.reorderedExperience
    } catch {}

    let coverLetter = ''
    try {
      coverLetter = await generateCoverLetter(profile, job.title, job.company, job.job_description || '', tailoredSummary)
    } catch {}

    const cvData = await buildCVData(profile, workExperience, education, skills, certifications, tailoredSummary, highlightedSkills, reorderedExperience)
    const template = settings?.cv_template || 'classic'

    let pdfPath: string | null = null
    try {
      pdfPath = await generateCVPdf(cvData, template, applicationId)
    } catch {}

    const cvResult = db.prepare(`
      INSERT INTO cv_versions (application_id, template, tailored_summary, tailored_content, pdf_path)
      VALUES (?, ?, ?, ?, ?)
    `).run(applicationId, template, tailoredSummary, JSON.stringify({ highlightedSkills, reorderedExperience }), pdfPath)

    db.prepare('UPDATE applications SET cv_version_id=?, cover_letter=? WHERE id=?')
      .run(cvResult.lastInsertRowid, coverLetter, applicationId)

    notifyQueueUpdate()
    return { applicationId, success: true }
  })

  ipcMain.handle('queue:get', () => {
    const db = getDb()
    return db.prepare(`
      SELECT a.*, cv.tailored_summary, cv.tailored_content, cv.pdf_path, cv.template
      FROM applications a
      LEFT JOIN cv_versions cv ON cv.id = a.cv_version_id
      WHERE a.status = 'pending_review'
      ORDER BY a.queued_at DESC
    `).all()
  })

  ipcMain.handle('queue:get-detail', (_, applicationId: number) => {
    const db = getDb()
    const app = db.prepare(`
      SELECT a.*, cv.tailored_summary, cv.tailored_content, cv.pdf_path, cv.template
      FROM applications a
      LEFT JOIN cv_versions cv ON cv.id = a.cv_version_id
      WHERE a.id = ?
    `).get(applicationId) as any

    if (!app) return null

    const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get()
    const workExperience = db.prepare('SELECT * FROM work_experience ORDER BY sort_order, id').all()
    const education = db.prepare('SELECT * FROM education ORDER BY sort_order, id').all()
    const skills = db.prepare('SELECT * FROM skills ORDER BY sort_order, id').all()
    const certifications = db.prepare('SELECT * FROM certifications ORDER BY sort_order, id').all()

    let tailoredContent: any = {}
    try { tailoredContent = JSON.parse(app.tailored_content || '{}') } catch {}

    const cvData = {
      profile, workExperience, education, skills, certifications,
      tailoredSummary: app.tailored_summary || '',
      highlightedSkills: tailoredContent.highlightedSkills || []
    }

    return { ...app, cvData }
  })

  ipcMain.handle('queue:approve', async (_, applicationId: number) => {
    const db = getDb()
    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as any
    if (!application) return { error: 'Application not found' }

    const cv = db.prepare('SELECT * FROM cv_versions WHERE id = ?').get(application.cv_version_id) as any
    const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as any

    const result = await submitApplication({
      applicationId,
      jobUrl: application.job_url,
      company: application.company,
      title: application.title,
      cvPdfPath: cv?.pdf_path || '',
      coverLetter: application.cover_letter || '',
      profile
    })

    if (result.success) {
      db.prepare(`
        UPDATE applications SET status='submitted', application_status='Submitted',
        submission_screenshot=?, submitted_at=datetime('now') WHERE id=?
      `).run(result.screenshotPath, applicationId)
    } else {
      db.prepare(`UPDATE applications SET status='failed', failure_reason=? WHERE id=?`)
        .run(result.error || 'Unknown error', applicationId)
      if (application.job_url) shell.openExternal(application.job_url)
    }

    notifyQueueUpdate()
    return { success: result.success, error: result.error }
  })

  ipcMain.handle('queue:skip', (_, applicationId: number) => {
    const db = getDb()
    db.prepare("UPDATE applications SET status='skipped' WHERE id=?").run(applicationId)
    db.prepare("UPDATE job_results SET status='skipped' WHERE id=(SELECT job_result_id FROM applications WHERE id=?)").run(applicationId)
    notifyQueueUpdate()
    return { success: true }
  })

  ipcMain.handle('queue:save-draft', (_, applicationId: number) => {
    const db = getDb()
    db.prepare("UPDATE applications SET status='draft' WHERE id=?").run(applicationId)
    notifyQueueUpdate()
    return { success: true }
  })

  ipcMain.handle('queue:update-cover-letter', (_, { applicationId, coverLetter }) => {
    const db = getDb()
    db.prepare('UPDATE applications SET cover_letter=? WHERE id=?').run(coverLetter, applicationId)
    return { success: true }
  })

  ipcMain.handle('queue:regenerate-cv', async (_, applicationId: number) => {
    const db = getDb()
    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as any
    if (!application) return { error: 'Not found' }

    const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as any
    const workExperience = db.prepare('SELECT * FROM work_experience ORDER BY sort_order, id').all() as any[]
    const education = db.prepare('SELECT * FROM education ORDER BY sort_order, id').all() as any[]
    const skills = db.prepare('SELECT * FROM skills ORDER BY sort_order, id').all() as any[]
    const certifications = db.prepare('SELECT * FROM certifications ORDER BY sort_order, id').all() as any[]
    const settings = db.prepare('SELECT cv_template FROM settings WHERE id = 1').get() as any

    const oldCv = db.prepare('SELECT * FROM cv_versions WHERE id = ?').get(application.cv_version_id) as any
    let tailoredContent: any = {}
    try { tailoredContent = JSON.parse(oldCv?.tailored_content || '{}') } catch {}

    const cvData = {
      profile, workExperience, education, skills, certifications,
      tailoredSummary: oldCv?.tailored_summary || '',
      highlightedSkills: tailoredContent.highlightedSkills || []
    }

    const template = settings?.cv_template || 'classic'
    const pdfPath = await generateCVPdf(cvData, template, applicationId)

    db.prepare('UPDATE cv_versions SET pdf_path=?, template=? WHERE id=?').run(pdfPath, template, application.cv_version_id)
    return { success: true, pdfPath }
  })

  ipcMain.handle('applications:history', (_, { limit = 100, status, search } = {}) => {
    const db = getDb()
    let sql = `
      SELECT a.*, cv.pdf_path, cv.template
      FROM applications a
      LEFT JOIN cv_versions cv ON cv.id = a.cv_version_id
      WHERE a.status != 'pending_review'
    `
    const params: any[] = []
    if (status) { sql += ' AND a.application_status = ?'; params.push(status) }
    if (search) { sql += ' AND (a.company LIKE ? OR a.title LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
    sql += ' ORDER BY a.queued_at DESC LIMIT ?'
    params.push(limit)
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('applications:update-status', (_, { id, applicationStatus }) => {
    const db = getDb()
    db.prepare('UPDATE applications SET application_status=? WHERE id=?').run(applicationStatus, id)
    return { success: true }
  })

  ipcMain.handle('applications:export-csv', () => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT company, title, job_url, status, application_status, queued_at, submitted_at, notes
      FROM applications ORDER BY queued_at DESC
    `).all() as any[]

    const headers = 'Company,Title,URL,Status,Application Status,Queued,Submitted,Notes'
    const csv = [headers, ...rows.map((r) =>
      [r.company, r.title, r.job_url, r.status, r.application_status, r.queued_at, r.submitted_at, r.notes]
        .map((v) => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',')
    )].join('\n')

    return csv
  })

  ipcMain.handle('queue:get-cv-html', (_, applicationId: number) => {
    const db = getDb()
    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as any
    if (!application) return null

    const cv = db.prepare('SELECT * FROM cv_versions WHERE id = ?').get(application.cv_version_id) as any
    const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as any
    const workExperience = db.prepare('SELECT * FROM work_experience ORDER BY sort_order, id').all() as any[]
    const education = db.prepare('SELECT * FROM education ORDER BY sort_order, id').all() as any[]
    const skills = db.prepare('SELECT * FROM skills ORDER BY sort_order, id').all() as any[]
    const certifications = db.prepare('SELECT * FROM certifications ORDER BY sort_order, id').all() as any[]
    const settings = db.prepare('SELECT cv_template FROM settings WHERE id = 1').get() as any

    let tailoredContent: any = {}
    try { tailoredContent = JSON.parse(cv?.tailored_content || '{}') } catch {}

    const cvData = {
      profile, workExperience, education, skills, certifications,
      tailoredSummary: cv?.tailored_summary || profile?.summary || '',
      highlightedSkills: tailoredContent.highlightedSkills || []
    }

    const template = settings?.cv_template || cv?.template || 'classic'
    return getCVHtml(cvData, template)
  })

  ipcMain.handle('applications:get-stats', () => {
    const db = getDb()
    const total = (db.prepare("SELECT COUNT(*) as c FROM applications WHERE status != 'pending_review'").get() as any)?.c || 0
    const submitted = (db.prepare("SELECT COUNT(*) as c FROM applications WHERE status = 'submitted'").get() as any)?.c || 0
    const skipped = (db.prepare("SELECT COUNT(*) as c FROM applications WHERE status = 'skipped'").get() as any)?.c || 0
    const failed = (db.prepare("SELECT COUNT(*) as c FROM applications WHERE status = 'failed'").get() as any)?.c || 0
    const queued = (db.prepare("SELECT COUNT(*) as c FROM applications WHERE status = 'pending_review'").get() as any)?.c || 0
    const last30 = (db.prepare("SELECT COUNT(*) as c FROM applications WHERE status='submitted' AND submitted_at >= datetime('now', '-30 days')").get() as any)?.c || 0

    const recent = db.prepare(`
      SELECT a.company, a.title, a.status, a.submitted_at, a.queued_at
      FROM applications a
      ORDER BY COALESCE(a.submitted_at, a.queued_at) DESC
      LIMIT 10
    `).all()

    return { total, submitted, skipped, failed, queued, last30, recent }
  })

  ipcMain.handle('shell:open-file', (_, filePath: string) => {
    shell.openPath(filePath)
    return { success: true }
  })
}
