import { chromium } from 'playwright'
import { join } from 'path'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { getDataDir } from '../db'

export interface CVData {
  profile: Record<string, unknown>
  workExperience: Array<Record<string, unknown>>
  education: Array<Record<string, unknown>>
  skills: Array<{ name: string }>
  certifications: Array<Record<string, unknown>>
  tailoredSummary: string
  highlightedSkills: string[]
  reorderedExperience: number[]
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildExperienceHtml(experiences: Array<Record<string, unknown>>, order: number[]): string {
  const sorted = order.length > 0
    ? order.map((id) => experiences.find((e) => e.id === id)).filter(Boolean) as Array<Record<string, unknown>>
    : experiences
  return sorted.map((e) => `
    <div class="experience-item">
      <div class="exp-header">
        <div>
          <div class="exp-title">${esc(String(e.title || ''))}</div>
          <div class="exp-company">${esc(String(e.company || ''))}${e.location ? ` · ${esc(String(e.location))}` : ''}</div>
        </div>
        <div class="exp-dates">${esc(String(e.start_date || ''))} – ${e.is_current ? 'Present' : esc(String(e.end_date || ''))}</div>
      </div>
      ${e.description ? `<p class="exp-desc">${esc(String(e.description))}</p>` : ''}
      ${e.achievements ? `<ul class="achievements">${String(e.achievements).split('\n').filter(Boolean).map((a) => `<li>${esc(a.replace(/^[-•]\s*/, ''))}</li>`).join('')}</ul>` : ''}
    </div>`).join('')
}

function buildEducationHtml(educations: Array<Record<string, unknown>>): string {
  return educations.map((e) => `
    <div class="education-item">
      <div class="edu-header">
        <div>
          <div class="edu-degree">${esc(String(e.degree || ''))}${e.field_of_study ? ` in ${esc(String(e.field_of_study))}` : ''}</div>
          <div class="edu-institution">${esc(String(e.institution || ''))}</div>
        </div>
        <div class="edu-year">${esc(String(e.graduation_year || ''))}</div>
      </div>
      ${e.gpa ? `<div class="edu-gpa">GPA: ${esc(String(e.gpa))}</div>` : ''}
      ${e.honors ? `<div class="edu-honors">${esc(String(e.honors))}</div>` : ''}
    </div>`).join('')
}

function buildCertHtml(certs: Array<Record<string, unknown>>): string {
  if (!certs.length) return ''
  return `<div class="section"><h2>Certifications</h2>` +
    certs.map((c) => `<div class="cert-item"><span class="cert-name">${esc(String(c.name || ''))}</span>${c.issuing_org ? ` · <span class="cert-org">${esc(String(c.issuing_org))}</span>` : ''}${c.year ? ` · ${esc(String(c.year))}` : ''}</div>`).join('') +
    '</div>'
}

export function buildCVHtml(data: CVData, template: string): string {
  const skills = data.highlightedSkills.length > 0 ? data.highlightedSkills : data.skills.map((s) => s.name)

  // Try to load an external template file
  const tplPath = join(process.cwd(), 'resources', 'templates', `${template}.html`)
  if (existsSync(tplPath)) {
    let html = readFileSync(tplPath, 'utf-8')
    html = html
      .replace(/{{FULL_NAME}}/g, esc(String(data.profile.full_name || '')))
      .replace(/{{EMAIL}}/g, esc(String(data.profile.email || '')))
      .replace(/{{PHONE}}/g, esc(String(data.profile.phone || '')))
      .replace(/{{LOCATION}}/g, esc(String(data.profile.location || '')))
      .replace(/{{LINKEDIN}}/g, esc(String(data.profile.linkedin_url || '')))
      .replace(/{{WEBSITE}}/g, esc(String(data.profile.website_url || '')))
      .replace(/{{GITHUB}}/g, esc(String(data.profile.github_url || '')))
      .replace(/{{SUMMARY}}/g, esc(data.tailoredSummary || String(data.profile.summary || '')))
      .replace(/{{SKILLS}}/g, skills.map((s) => `<span class="skill-tag">${esc(s)}</span>`).join(''))
      .replace(/{{EXPERIENCE}}/g, buildExperienceHtml(data.workExperience, data.reorderedExperience))
      .replace(/{{EDUCATION}}/g, buildEducationHtml(data.education))
      .replace(/{{CERTIFICATIONS}}/g, buildCertHtml(data.certifications))
    return html
  }

  // Built-in fallback template
  const isModern = template === 'modern'
  const isMinimal = template === 'minimal'
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${isMinimal ? "-apple-system, BlinkMacSystemFont, sans-serif" : "'Georgia', serif"}; font-size: 11pt; color: #1a1a1a; padding: ${isMinimal ? '50px 60px' : '40px'}; line-height: 1.5; }
  h1 { font-size: 24pt; font-weight: bold; }
  h2 { font-size: ${isMinimal ? '10pt' : '12pt'}; text-transform: uppercase; letter-spacing: ${isMinimal ? '2px' : '1px'}; ${isModern ? 'color: #1e3a5f;' : ''} ${isMinimal ? 'color: #888; border-bottom: none;' : 'border-bottom: 1px solid #ccc;'} padding-bottom: 4px; margin: 20px 0 10px; }
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
  .skill-tag { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 8px; background: ${isMinimal ? 'none' : '#f0f0f0'}; ${isMinimal ? 'border: 1px solid #ddd;' : ''} border-radius: 3px; font-size: 10pt; }
  .cert-item { margin-bottom: 4px; font-size: 10.5pt; }
  .cert-name { font-weight: 600; }
  ${isModern ? '.header { background: #1e3a5f; color: white; padding: 30px 40px; margin: -40px -40px 30px; } .header h1 { color: white; } .header .contact { color: #ccd6f6; }' : ''}
</style>
</head>
<body>
  <div class="${isModern ? 'header' : ''}">
    <h1>${esc(String(data.profile.full_name || ''))}</h1>
    <div class="contact">${esc(String(data.profile.email || ''))} · ${esc(String(data.profile.phone || ''))} · ${esc(String(data.profile.location || ''))}</div>
    <div class="contact">${esc(String(data.profile.linkedin_url || ''))} · ${esc(String(data.profile.github_url || ''))} · ${esc(String(data.profile.website_url || ''))}</div>
  </div>
  <div class="section"><h2>Professional Summary</h2><p>${esc(data.tailoredSummary || String(data.profile.summary || ''))}</p></div>
  <div class="section"><h2>Experience</h2>${buildExperienceHtml(data.workExperience, data.reorderedExperience)}</div>
  <div class="section"><h2>Education</h2>${buildEducationHtml(data.education)}</div>
  <div class="section"><h2>Skills</h2><div>${skills.map((s) => `<span class="skill-tag">${esc(s)}</span>`).join('')}</div></div>
  ${buildCertHtml(data.certifications)}
</body>
</html>`
}

export async function generateCVPdf(data: CVData, template: string, applicationId: number): Promise<string> {
  const html = buildCVHtml(data, template)
  const pdfDir = join(getDataDir(), 'cvs')
  mkdirSync(pdfDir, { recursive: true })
  const pdfPath = join(pdfDir, `cv-${applicationId}-${Date.now()}.pdf`)

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true })
    writeFileSync(pdfPath, pdfBuffer)
    await page.close()
  } finally {
    await browser.close()
  }
  return pdfPath
}
