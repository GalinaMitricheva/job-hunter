import express from 'express'
import { getDb } from '../db'
import { getConfig } from '../config'
import { submitApplication } from '../services/auto-apply'
import { buildCVHtml, CVData } from '../services/cv-generator'
import { pageShell, scoreClass } from './templates'

export function startReviewServer(): void {
  const app = express()
  app.use(express.urlencoded({ extended: true }))
  app.use(express.json())

  // --- Queue (pending review) ---
  app.get('/', (_req, res) => {
    const db = getDb()
    const apps = db.prepare(`
      SELECT a.*, jr.relevance_score, jr.relevance_reasoning, cv.pdf_path, cv.tailored_summary, cv.tailored_content
      FROM applications a
      LEFT JOIN job_results jr ON jr.id = a.job_result_id
      LEFT JOIN cv_versions cv ON cv.id = a.cv_version_id
      WHERE a.status = 'pending_review'
      ORDER BY jr.relevance_score DESC, a.queued_at DESC
    `).all() as Array<Record<string, unknown>>

    const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as Record<string, unknown>
    const workExperience = db.prepare('SELECT * FROM work_experience ORDER BY sort_order').all() as Array<Record<string, unknown>>
    const education = db.prepare('SELECT * FROM education ORDER BY sort_order').all() as Array<Record<string, unknown>>
    const skills = db.prepare('SELECT * FROM skills ORDER BY sort_order').all() as Array<{ name: string }>
    const certifications = db.prepare('SELECT * FROM certifications ORDER BY sort_order').all() as Array<Record<string, unknown>>

    const statsRow = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'pending_review' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped
      FROM applications
    `).get() as Record<string, number>

    const statsHtml = `
      <div class="stats">
        <div class="stat"><div class="stat-value">${statsRow.pending}</div><div class="stat-label">Pending Review</div></div>
        <div class="stat"><div class="stat-value">${statsRow.submitted}</div><div class="stat-label">Submitted</div></div>
        <div class="stat"><div class="stat-value">${statsRow.skipped}</div><div class="stat-label">Skipped</div></div>
      </div>`

    if (apps.length === 0) {
      res.send(pageShell('Queue', `<h1>Application Queue</h1>${statsHtml}<div class="empty">No applications pending review. Run a search to fill the queue.</div>`))
      return
    }

    const cards = apps.map((a) => {
      const score = Number(a.relevance_score || 0)
      const tailoredContent = JSON.parse(String(a.tailored_content || '{}')) as { highlightedSkills?: string[]; reorderedExperience?: number[] }
      const cvData: CVData = {
        profile, workExperience, education, skills, certifications,
        tailoredSummary: String(a.tailored_summary || profile.summary || ''),
        highlightedSkills: tailoredContent.highlightedSkills || [],
        reorderedExperience: tailoredContent.reorderedExperience || []
      }
      const cvHtml = buildCVHtml(cvData, 'classic')
      const coverLetter = String(a.cover_letter || '')

      return `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div>
              <h2>${esc(String(a.title))} — ${esc(String(a.company))}</h2>
              <div class="meta">
                <a href="${esc(String(a.job_url))}" target="_blank">View posting ↗</a>
                · Queued ${new Date(String(a.queued_at)).toLocaleDateString()}
              </div>
              <div class="reasoning">${esc(String(a.relevance_reasoning || ''))}</div>
            </div>
            <span class="score ${scoreClass(score)}">${score}% match</span>
          </div>

          <div class="grid" style="margin-top:16px">
            <div>
              <h2>Tailored CV</h2>
              <div class="cv-preview">${cvHtml}</div>
            </div>
            <div>
              <h2>Cover Letter</h2>
              <form method="POST" action="/edit/${a.id}">
                <textarea class="edit-cover" name="cover_letter">${esc(coverLetter)}</textarea>
                <div style="margin-top:6px">
                  <button class="btn btn-gray" type="submit">Save edits</button>
                </div>
              </form>
            </div>
          </div>

          <div class="actions">
            <form method="POST" action="/approve/${a.id}">
              <button class="btn btn-green" type="submit">✓ Approve &amp; Apply</button>
            </form>
            <form method="POST" action="/skip/${a.id}">
              <button class="btn btn-red" type="submit">✕ Skip</button>
            </form>
            ${a.pdf_path ? `<a class="btn btn-gray" href="/cv/${a.id}" target="_blank">Download CV PDF</a>` : ''}
          </div>
        </div>`
    }).join('')

    res.send(pageShell('Queue', `<h1>Application Queue</h1>${statsHtml}${cards}`))
  })

  // --- Approve & apply ---
  app.post('/approve/:id', async (req, res) => {
    const db = getDb()
    const id = Number(req.params.id)
    const app_ = db.prepare(`
      SELECT a.*, cv.pdf_path, cv.tailored_summary FROM applications a
      LEFT JOIN cv_versions cv ON cv.id = a.cv_version_id
      WHERE a.id = ?
    `).get(id) as Record<string, unknown> | undefined

    if (!app_) { res.redirect('/'); return }

    const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get() as Record<string, unknown>

    const result = await submitApplication({
      applicationId: id,
      jobUrl: String(app_.job_url),
      company: String(app_.company),
      title: String(app_.title),
      cvPdfPath: String(app_.pdf_path || ''),
      coverLetter: String(app_.cover_letter || ''),
      profile
    })

    if (result.success) {
      db.prepare(`UPDATE applications SET status = 'submitted', application_status = 'Applied', submitted_at = datetime('now'), submission_screenshot = ? WHERE id = ?`)
        .run(result.screenshotPath, id)
    } else {
      db.prepare(`UPDATE applications SET status = 'manual', failure_reason = ?, manual_steps = ?, submission_screenshot = ? WHERE id = ?`)
        .run(result.error || 'Auto-apply not supported', result.manualSteps || null, result.screenshotPath, id)
    }

    res.redirect('/')
  })

  // --- Skip ---
  app.post('/skip/:id', (req, res) => {
    const db = getDb()
    db.prepare(`UPDATE applications SET status = 'skipped' WHERE id = ?`).run(Number(req.params.id))
    res.redirect('/')
  })

  // --- Edit cover letter ---
  app.post('/edit/:id', (req, res) => {
    const db = getDb()
    const coverLetter = String(req.body.cover_letter || '')
    db.prepare('UPDATE applications SET cover_letter = ? WHERE id = ?').run(coverLetter, Number(req.params.id))
    res.redirect('/')
  })

  // --- Serve CV PDF ---
  app.get('/cv/:id', (req, res) => {
    const db = getDb()
    const cv = db.prepare(`SELECT cv.pdf_path FROM applications a LEFT JOIN cv_versions cv ON cv.id = a.cv_version_id WHERE a.id = ?`).get(Number(req.params.id)) as { pdf_path: string } | undefined
    if (cv?.pdf_path) {
      res.sendFile(cv.pdf_path)
    } else {
      res.status(404).send('CV not found')
    }
  })

  // --- History ---
  app.get('/history', (_req, res) => {
    const db = getDb()
    const apps = db.prepare(`
      SELECT a.*, jr.relevance_score
      FROM applications a
      LEFT JOIN job_results jr ON jr.id = a.job_result_id
      WHERE a.status != 'pending_review'
      ORDER BY a.queued_at DESC
      LIMIT 100
    `).all() as Array<Record<string, unknown>>

    const statusBadge = (status: string): string => {
      const cls = status === 'submitted' ? 'submitted' : status === 'skipped' ? 'skipped' : 'manual'
      const label = status === 'submitted' ? 'Submitted' : status === 'skipped' ? 'Skipped' : 'Manual needed'
      return `<span class="badge badge-${cls}">${label}</span>`
    }

    const rows = apps.map((a) => `
      <div class="card" style="padding:14px 20px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div>
            <strong>${esc(String(a.title))}</strong> — ${esc(String(a.company))}
            <div class="meta"><a href="${esc(String(a.job_url))}" target="_blank">View posting ↗</a> · ${new Date(String(a.queued_at)).toLocaleDateString()}</div>
            ${a.manual_steps ? `<details style="margin-top:8px"><summary style="cursor:pointer;color:#b45309;font-size:12px">Manual apply steps</summary><pre style="font-size:11px;white-space:pre-wrap;margin-top:6px;color:#555">${esc(String(a.manual_steps))}</pre></details>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            ${statusBadge(String(a.status))}
            <div class="meta" style="margin-top:4px">${Number(a.relevance_score || 0)}% match</div>
          </div>
        </div>
      </div>`).join('')

    res.send(pageShell('History', `<h1>History</h1>${apps.length === 0 ? '<div class="empty">No history yet.</div>' : rows}`))
  })

  const port = getConfig().reviewPort || 3000
  app.listen(port, () => {
    console.log(`Review UI running at http://localhost:${port}`)
  })
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
