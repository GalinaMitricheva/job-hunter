import { chromium } from 'playwright'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { app, safeStorage } from 'electron'
import { getDb } from '../db'

interface ApplicationData {
  applicationId: number
  jobUrl: string
  company: string
  title: string
  cvPdfPath: string
  coverLetter: string
  profile: any
}

function getLinkedInCredentials(): { email: string; password: string } | null {
  const db = getDb()
  const s = db.prepare('SELECT linkedin_email, linkedin_password_encrypted FROM settings WHERE id = 1').get() as any
  if (!s?.linkedin_email || !s?.linkedin_password_encrypted) return null
  try {
    const encBuf = Buffer.from(s.linkedin_password_encrypted, 'base64')
    const password = safeStorage.decryptString(encBuf)
    return { email: s.linkedin_email, password }
  } catch {
    return null
  }
}

async function saveScreenshot(page: any, applicationId: number): Promise<string | null> {
  try {
    const screenshotDir = join(app.getPath('userData'), 'screenshots')
    mkdirSync(screenshotDir, { recursive: true })
    const screenshotPath = join(screenshotDir, `app-${applicationId}-${Date.now()}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: false })
    return screenshotPath
  } catch {
    return null
  }
}

async function fillEasyApplyLinkedIn(page: any, data: ApplicationData): Promise<boolean> {
  try {
    const easyApplyBtn = await page.$('[data-control-name="jobdetails_topcard_inapply"], .jobs-apply-button')
    if (!easyApplyBtn) return false

    await easyApplyBtn.click()
    await page.waitForTimeout(2000)

    let attempts = 0
    while (attempts < 10) {
      const modal = await page.$('.jobs-easy-apply-modal')
      if (!modal) break

      const phoneInput = await page.$('input[id*="phone"]')
      if (phoneInput) await phoneInput.fill(data.profile.phone || '')

      const cityInput = await page.$('input[id*="city"]')
      if (cityInput) await cityInput.fill(data.profile.location || '')

      const coverLetterArea = await page.$('textarea[id*="cover-letter"]')
      if (coverLetterArea) await coverLetterArea.fill(data.coverLetter)

      const resumeUpload = await page.$('input[type="file"]')
      if (resumeUpload && data.cvPdfPath) {
        await resumeUpload.setInputFiles(data.cvPdfPath)
        await page.waitForTimeout(1000)
      }

      const nextBtn = await page.$('button[aria-label="Continue to next step"], button[aria-label="Submit application"]')
      if (!nextBtn) break

      const btnLabel = await nextBtn.getAttribute('aria-label')
      if (btnLabel?.includes('Submit')) {
        await nextBtn.click()
        await page.waitForTimeout(2000)
        return true
      }

      await nextBtn.click()
      await page.waitForTimeout(1500)
      attempts++
    }
    return false
  } catch {
    return false
  }
}

async function fillGreenhouseForm(page: any, data: ApplicationData): Promise<boolean> {
  try {
    await page.fill('#first_name', data.profile.full_name?.split(' ')[0] || '').catch(() => {})
    await page.fill('#last_name', data.profile.full_name?.split(' ').slice(1).join(' ') || '').catch(() => {})
    await page.fill('#email', data.profile.email || '').catch(() => {})
    await page.fill('#phone', data.profile.phone || '').catch(() => {})

    const resumeInput = await page.$('input[type="file"]')
    if (resumeInput && data.cvPdfPath) {
      await resumeInput.setInputFiles(data.cvPdfPath)
      await page.waitForTimeout(1500)
    }

    const coverLetterArea = await page.$('textarea[id*="cover"]')
    if (coverLetterArea) await coverLetterArea.fill(data.coverLetter)

    const submitBtn = await page.$('input[type="submit"], button[type="submit"]')
    if (submitBtn) {
      await submitBtn.click()
      await page.waitForTimeout(3000)
      return true
    }
    return false
  } catch {
    return false
  }
}

async function fillLeverForm(page: any, data: ApplicationData): Promise<boolean> {
  try {
    await page.fill('input[name="name"]', data.profile.full_name || '').catch(() => {})
    await page.fill('input[name="email"]', data.profile.email || '').catch(() => {})
    await page.fill('input[name="phone"]', data.profile.phone || '').catch(() => {})

    const resumeInput = await page.$('input[type="file"]')
    if (resumeInput && data.cvPdfPath) {
      await resumeInput.setInputFiles(data.cvPdfPath)
      await page.waitForTimeout(1500)
    }

    const coverLetterArea = await page.$('textarea[name*="comment"], textarea[placeholder*="cover"]')
    if (coverLetterArea) await coverLetterArea.fill(data.coverLetter)

    const submitBtn = await page.$('button[type="submit"]')
    if (submitBtn) {
      await submitBtn.click()
      await page.waitForTimeout(3000)
      return true
    }
    return false
  } catch {
    return false
  }
}

export async function submitApplication(data: ApplicationData): Promise<{
  success: boolean
  screenshotPath: string | null
  error?: string
}> {
  const db = getDb()
  const settings = db.prepare('SELECT headless_browser FROM settings WHERE id = 1').get() as any
  const headless = settings?.headless_browser !== 0

  const browser = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })

  let screenshotPath: string | null = null

  try {
    const page = await context.newPage()

    if (data.jobUrl.includes('linkedin.com')) {
      const creds = getLinkedInCredentials()
      if (creds) {
        await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' })
        const isLoggedIn = await page.$('.global-nav__me-photo')
        if (!isLoggedIn) {
          await page.fill('#username', creds.email)
          await page.fill('#password', creds.password)
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

    return { success, screenshotPath }
  } catch (err: any) {
    return { success: false, screenshotPath, error: err.message }
  } finally {
    await context.close()
    await browser.close()
  }
}
