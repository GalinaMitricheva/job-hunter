import { BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { app } from 'electron'
import { getDb } from '../db'

const TEMPLATES = {
  classic: 'classic',
  modern: 'modern',
  minimal: 'minimal'
}

function getTemplatePath(template: string): string {
  return join(app.getAppPath(), 'resources', 'templates', `${template}.html`)
}

function buildCVHtml(template: string, data: CVData): string {
  let html: string
  try {
    html = readFileSync(getTemplatePath(template), 'utf-8')
  } catch {
    html = getDefaultTemplate(template)
  }

  const skills = data.highlightedSkills.length > 0 ? data.highlightedSkills : data.skills.map((s: any) => s.name)

  html = html
    .replace(/{{FULL_NAME}}/g, esc(data.profile.full_name || ''))
    .replace(/{{EMAIL}}/g, esc(data.profile.email || ''))
    .replace(/{{PHONE}}/g, esc(data.profile.phone || ''))
    .replace(/{{LOCATION}}/g, esc(data.profile.location || ''))
    .replace(/{{LINKEDIN}}/g, esc(data.profile.linkedin_url || ''))
    .replace(/{{WEBSITE}}/g, esc(data.profile.website_url || ''))
    .replace(/{{GITHUB}}/g, esc(data.profile.github_url || ''))
    .replace(/{{SUMMARY}}/g, esc(data.tailoredSummary || data.profile.summary || ''))
    .replace(/{{SKILLS}}/g, skills.map((s: string) => `<span class="skill-tag">${esc(s)}</span>`).join(''))
    .replace(/{{EXPERIENCE}}/g, buildExperienceHtml(data.workExperience))
    .replace(/{{EDUCATION}}/g, buildEducationHtml(data.education))
    .replace(/{{CERTIFICATIONS}}/g, buildCertificationsHtml(data.certifications))

  return html
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildExperienceHtml(experiences: any[]): string {
  return experiences
    .map(
      (e) => `
    <div class="experience-item">
      <div class="exp-header">
        <div>
          <div class="exp-title">${esc(e.title)}</div>
          <div class="exp-company">${esc(e.company)}${e.location ? ` · ${esc(e.location)}` : ''}</div>
        </div>
        <div class="exp-dates">${esc(e.start_date)} – ${e.is_current ? 'Present' : esc(e.end_date || '')}</div>
      </div>
      ${e.description ? `<p class="exp-desc">${esc(e.description)}</p>` : ''}
      ${e.achievements ? `<ul class="achievements">${e.achievements.split('\n').filter(Boolean).map((a: string) => `<li>${esc(a.replace(/^[-•]\s*/, ''))}</li>`).join('')}</ul>` : ''}
    </div>`
    )
    .join('')
}

function buildEducationHtml(educations: any[]): string {
  return educations
    .map(
      (e) => `
    <div class="education-item">
      <div class="edu-header">
        <div>
          <div class="edu-degree">${esc(e.degree)}${e.field_of_study ? ` in ${esc(e.field_of_study)}` : ''}</div>
          <div class="edu-institution">${esc(e.institution)}</div>
        </div>
        <div class="edu-year">${esc(e.graduation_year || '')}</div>
      </div>
      ${e.gpa ? `<div class="edu-gpa">GPA: ${esc(e.gpa)}</div>` : ''}
      ${e.honors ? `<div class="edu-honors">${esc(e.honors)}</div>` : ''}
    </div>`
    )
    .join('')
}

function buildCertificationsHtml(certs: any[]): string {
  if (!certs.length) return ''
  return certs
    .map((c) => `<div class="cert-item"><span class="cert-name">${esc(c.name)}</span>${c.issuing_org ? ` · <span class="cert-org">${esc(c.issuing_org)}</span>` : ''}${c.year ? ` · ${esc(c.year)}` : ''}</div>`)
    .join('')
}

interface CVData {
  profile: any
  workExperience: any[]
  education: any[]
  skills: any[]
  certifications: any[]
  tailoredSummary: string
  highlightedSkills: string[]
}

/**
 * Generates a PDF from the tailored CV HTML using Electron's built-in
 * webContents.printToPDF — this avoids shipping a separate Chromium binary
 * (as Puppeteer would require) since Electron already bundles Chromium.
 * The output quality and A4 layout are equivalent to Puppeteer's approach.
 */
export async function generateCVPdf(
  data: CVData,
  template: string,
  applicationId: number
): Promise<string> {
  const html = buildCVHtml(template, data)

  const pdfDir = join(app.getPath('userData'), 'cvs')
  mkdirSync(pdfDir, { recursive: true })
  const pdfPath = join(pdfDir, `cv-${applicationId}-${Date.now()}.pdf`)

  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false }
  })

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })
    writeFileSync(pdfPath, pdfBuffer)
    return pdfPath
  } finally {
    win.destroy()
  }
}

function getDefaultTemplate(template: string): string {
  const base = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia', serif; font-size: 11pt; color: #1a1a1a; padding: 40px; line-height: 1.5; }
  h1 { font-size: 24pt; font-weight: bold; }
  h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 20px 0 10px; }
  .contact { color: #555; font-size: 10pt; margin: 6px 0; }
  .section { margin-bottom: 18px; }
  .exp-header, .edu-header { display: flex; justify-content: space-between; align-items: flex-start; }
  .exp-title, .edu-degree { font-weight: bold; font-size: 11pt; }
  .exp-company, .edu-institution { color: #444; font-size: 10.5pt; }
  .exp-dates, .edu-year { color: #777; font-size: 10pt; white-space: nowrap; }
  .experience-item, .education-item { margin-bottom: 14px; }
  .exp-desc { margin-top: 4px; color: #333; }
  .achievements { margin-top: 4px; padding-left: 16px; color: #333; }
  .achievements li { margin-bottom: 2px; }
  .skill-tag { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 8px; background: #f0f0f0; border-radius: 3px; font-size: 10pt; }
  .cert-item { margin-bottom: 4px; font-size: 10.5pt; }
  .cert-name { font-weight: 600; }
  ${template === 'modern' ? '.header { background: #1e3a5f; color: white; padding: 30px 40px; margin: -40px -40px 30px; } .header h1 { color: white; } .header .contact { color: #ccd6f6; } h2 { color: #1e3a5f; border-bottom-color: #1e3a5f; }' : ''}
  ${template === 'minimal' ? 'body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 50px 60px; } h2 { font-size: 10pt; color: #888; border-bottom: none; letter-spacing: 2px; } .exp-title { font-size: 11.5pt; } .skill-tag { background: none; border: 1px solid #ddd; }' : ''}
</style>
</head>
<body>
  <div class="${template === 'modern' ? 'header' : ''}">
    <h1>{{FULL_NAME}}</h1>
    <div class="contact">{{EMAIL}} ${template !== 'minimal' ? '· {{PHONE}} · {{LOCATION}}' : ''}</div>
    ${template !== 'minimal' ? '<div class="contact">{{LINKEDIN}} · {{GITHUB}} · {{WEBSITE}}</div>' : ''}
  </div>
  ${template !== 'modern' ? '<div style="height:16px"></div>' : ''}
  <div class="section">
    <h2>Professional Summary</h2>
    <p>{{SUMMARY}}</p>
  </div>
  <div class="section">
    <h2>Experience</h2>
    {{EXPERIENCE}}
  </div>
  <div class="section">
    <h2>Education</h2>
    {{EDUCATION}}
  </div>
  <div class="section">
    <h2>Skills</h2>
    <div>{{SKILLS}}</div>
  </div>
  <div class="section">
    {{CERTIFICATIONS}}
  </div>
</body>
</html>`
  return base
}

export function getCVHtml(data: CVData, template: string): string {
  return buildCVHtml(template, data)
}
