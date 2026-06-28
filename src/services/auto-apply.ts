import { chromium, type Page } from 'playwright'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { getDataDir } from '../db'
import { getConfig } from '../config'

export interface ApplicationData {
  applicationId: number
  jobUrl: string
  company: string
  title: string
  cvPdfPath: string
  coverLetter: string
  profile: Record<string, unknown>
}

export interface ApplyResult {
  success: boolean
  screenshotPath: string | null
  manualSteps?: string
  error?: string
}

async function saveScreenshot(page: Page, applicationId: number): Promise<string | null> {
  try {
    const dir = join(getDataDir(), 'screenshots')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `app-${applicationId}-${Date.now()}.png`)
    await page.screenshot({ path, fullPage: false })
    return path
  } catch { return null }
}

async function fillEasyApplyLinkedIn(page: Page, data: ApplicationData): Promise<boolean> {
  try {
    const btn = await page.$('[data-control-name="jobdetails_topcard_inapply"], .jobs-apply-button')
    if (!btn) return false
    await btn.click()
    await page.waitForTimeout(2000)

    let attempts = 0
    while (attempts < 10) {
      const modal = await page.$('.jobs-easy-apply-modal')
      if (!modal) break

      const phoneInput = await page.$('input[id*="phone"]')
      if (phoneInput) await phoneInput.fill(String(data.profile.phone || ''))

      const cityInput = await page.$('input[id*="city"]')
      if (cityInput) await cityInput.fill(String(data.profile.location || ''))

      const coverArea = await page.$('textarea[id*="cover-letter"]')
      if (coverArea) await coverArea.fill(data.coverLetter)

      const resumeUpload = await page.$('input[type="file"]')
      if (resumeUpload && data.cvPdfPath) {
        await resumeUpload.setInputFiles(data.cvPdfPath)
        await page.waitForTimeout(1000)
      }

      const nextBtn = await page.$('button[aria-label="Continue to next step"], button[aria-label="Submit application"]')
      if (!nextBtn) break
      const btnLabel = await nextBtn.getAttribute('aria-label')
      if (btnLabel?.includes('Submit')) { await nextBtn.click(); await page.waitForTimeout(2000); return true }
      await nextBtn.click()
      await page.waitForTimeout(1500)
      attempts++
    }
    return false
  } catch { return false }
}

async function fillGreenhouseForm(page: Page, data: ApplicationData): Promise<boolean> {
  try {
    await page.fill('#first_name', String(data.profile.full_name || '').split(' ')[0] || '').catch(() => {})
    await page.fill('#last_name', String(data.profile.full_name || '').split(' ').slice(1).join(' ') || '').catch(() => {})
    await page.fill('#email', String(data.profile.email || '')).catch(() => {})
    await page.fill('#phone', String(data.profile.phone || '')).catch(() => {})

    const resumeInput = await page.$('input[type="file"]')
    if (resumeInput && data.cvPdfPath) { await resumeInput.setInputFiles(data.cvPdfPath); await page.waitForTimeout(1500) }

    const coverArea = await page.$('textarea[id*="cover"]')
    if (coverArea) await coverArea.fill(data.coverLetter)

    const submitBtn = await page.$('input[type="submit"], button[type="submit"]')
    if (submitBtn) { await submitBtn.click(); await page.waitForTimeout(3000); return true }
    return false
  } catch { return false }
}

async function fillLeverForm(page: Page, data: ApplicationData): Promise<boolean> {
  try {
    await page.fill('input[name="name"]', String(data.profile.full_name || '')).catch(() => {})
    await page.fill('input[name="email"]', String(data.profile.email || '')).catch(() => {})
    await page.fill('input[name="phone"]', String(data.profile.phone || '')).catch(() => {})

    const resumeInput = await page.$('input[type="file"]')
    if (resumeInput && data.cvPdfPath) { await resumeInput.setInputFiles(data.cvPdfPath); await page.waitForTimeout(1500) }

    const coverArea = await page.$('textarea[name*="comment"], textarea[placeholder*="cover"]')
    if (coverArea) await coverArea.fill(data.coverLetter)

    const submitBtn = await page.$('button[type="submit"]')
    if (submitBtn) { await submitBtn.click(); await page.waitForTimeout(3000); return true }
    return false
  } catch { return false }
}

function generateManualSteps(data: ApplicationData): string {
  return `Manual application steps for ${data.title} at ${data.company}:

1. Open: ${data.jobUrl}
2. Click the "Apply" button
3. Fill in your personal details:
   - Name: ${data.profile.full_name}
   - Email: ${data.profile.email}
   - Phone: ${data.profile.phone}
4. Upload your tailored CV from: ${data.cvPdfPath}
5. Paste your cover letter (saved in the review UI)
6. Submit the application`
}

export async function submitApplication(data: ApplicationData): Promise<ApplyResult> {
  const headless = getConfig().search.headlessBrowser
  const browser = await chromium.launch({ headless, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })

  let screenshotPath: string | null = null

  try {
    const page = await context.newPage()

    if (data.jobUrl.includes('linkedin.com')) {
      const { email, password } = getConfig().linkedin
      if (email && password) {
        await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' })
        const isLoggedIn = await page.$('.global-nav__me-photo')
        if (!isLoggedIn) {
          await page.fill('#username', email)
          await page.fill('#password', password)
          await page.click('[data-litms-control-urn="login-submit"]')
          await page.waitForLoadState('domcontentloaded')
          await page.waitForTimeout(2000)
        }
      }
    }

    await page.goto(data.jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    let success = false
    const urlLower = data.jobUrl.toLowerCase()

    if (urlLower.includes('linkedin.com')) {
      success = await fillEasyApplyLinkedIn(page, data)
    } else if (urlLower.includes('greenhouse.io') || urlLower.includes('boards.greenhouse')) {
      success = await fillGreenhouseForm(page, data)
    } else if (urlLower.includes('lever.co') || urlLower.includes('jobs.lever')) {
      success = await fillLeverForm(page, data)
    } else {
      const submitBtn = await page.$('button[type="submit"], input[type="submit"]')
      if (submitBtn) {
        const resumeInput = await page.$('input[type="file"]')
        if (resumeInput && data.cvPdfPath) await resumeInput.setInputFiles(data.cvPdfPath)
        const coverArea = await page.$('textarea')
        if (coverArea) await coverArea.fill(data.coverLetter)
        await submitBtn.click()
        await page.waitForTimeout(2000)
        success = true
      }
    }

    screenshotPath = await saveScreenshot(page, data.applicationId)
    await page.close()

    if (!success) {
      return { success: false, screenshotPath, manualSteps: generateManualSteps(data) }
    }
    return { success: true, screenshotPath }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, screenshotPath, manualSteps: generateManualSteps(data), error: message }
  } finally {
    await context.close()
    await browser.close()
  }
}
