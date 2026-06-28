import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { getConfig } from '../config'

const SEARCH_TIMEOUT_MS = 90_000
const PAGE_OP_TIMEOUT = 15_000

export type LinkedInErrorType = 'blocked' | 'captcha' | 'login_failed' | 'timeout' | 'network'

export class LinkedInError extends Error {
  constructor(message: string, public readonly type: LinkedInErrorType) {
    super(message)
    this.name = 'LinkedInError'
  }
}

export interface JobListing {
  url: string
  company: string
  title: string
  location: string
  postedDate: string
  description: string
}

let browserInstance: Browser | null = null

async function getBrowser(headless: boolean): Promise<Browser> {
  if (browserInstance) return browserInstance
  browserInstance = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  })
  return browserInstance
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close()
    browserInstance = null
  }
}

async function detectChallengePage(page: Page): Promise<{ blocked: boolean; reason: string }> {
  const url = page.url()
  if (
    url.includes('/checkpoint/') ||
    url.includes('/challenge/') ||
    url.includes('/uas/login') ||
    url.includes('/authwall')
  ) {
    return { blocked: true, reason: 'LinkedIn requires re-authentication or verification' }
  }

  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '').catch(() => '')

  if (/captcha|are you a robot|verify you're human/i.test(bodyText)) {
    return { blocked: true, reason: 'LinkedIn CAPTCHA challenge detected' }
  }
  if (/two-step verification|verify your identity|enter the code/i.test(bodyText)) {
    return { blocked: true, reason: 'LinkedIn 2FA challenge — sign in manually to continue' }
  }
  if (/rate limit|too many requests|temporarily restricted/i.test(bodyText)) {
    return { blocked: true, reason: 'LinkedIn rate-limited this session — try again later' }
  }

  const title = await page.title().catch(() => '')
  if (/sign in/i.test(title) || url.includes('/login')) {
    return { blocked: true, reason: 'LinkedIn session expired — credentials need updating' }
  }

  return { blocked: false, reason: '' }
}

async function loginToLinkedIn(context: BrowserContext): Promise<boolean> {
  const { email, password } = getConfig().linkedin
  if (!email || !password) return false

  const page = await context.newPage()
  try {
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: PAGE_OP_TIMEOUT })
    const isLoggedIn = await page.$('.global-nav__me-photo')
    if (isLoggedIn) { await page.close(); return true }

    await page.fill('#username', email, { timeout: PAGE_OP_TIMEOUT })
    await page.fill('#password', password, { timeout: PAGE_OP_TIMEOUT })
    await page.click('[data-litms-control-urn="login-submit"]', { timeout: PAGE_OP_TIMEOUT })
    await page.waitForLoadState('domcontentloaded', { timeout: PAGE_OP_TIMEOUT })

    const success = page.url().includes('feed') || page.url().includes('mynetwork')
    await page.close()
    return success
  } catch {
    await page.close()
    return false
  }
}

async function doLinkedInSearch(query: string, location: string, headless: boolean): Promise<JobListing[]> {
  const browser = await getBrowser(headless)
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  })

  const results: JobListing[] = []
  try {
    await loginToLinkedIn(context)
    const page = await context.newPage()
    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&f_TPR=r86400&sortBy=DD`
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_OP_TIMEOUT })

    const challenge = await detectChallengePage(page)
    if (challenge.blocked) { await page.close(); throw new LinkedInError(challenge.reason, 'blocked') }

    await page.waitForTimeout(2000 + Math.random() * 1000)
    const jobCards = await page.$$('[data-entity-urn*="jobPosting"]')

    for (const card of jobCards.slice(0, 20)) {
      try {
        await card.click({ timeout: PAGE_OP_TIMEOUT })
        await page.waitForTimeout(1000 + Math.random() * 500)

        const postChallenge = await detectChallengePage(page)
        if (postChallenge.blocked) throw new LinkedInError(postChallenge.reason, 'blocked')

        const url = page.url()
        const title = await page.$eval('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title', (el) => el.textContent?.trim() || '').catch(() => '')
        const company = await page.$eval('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name', (el) => el.textContent?.trim() || '').catch(() => '')
        const locationText = await page.$eval('.job-details-jobs-unified-top-card__primary-description-without-tagline, .jobs-unified-top-card__bullet', (el) => el.textContent?.trim() || '').catch(() => '')
        const description = await page.$eval('.jobs-description__content, .jobs-description', (el) => el.textContent?.trim() || '').catch(() => '')
        const postedDate = await page.$eval('time', (el) => el.getAttribute('datetime') || el.textContent?.trim() || '').catch(() => new Date().toISOString())

        if (title && company && url) {
          results.push({ url, company, title, location: locationText, postedDate, description })
        }
      } catch (err) {
        if (err instanceof LinkedInError) throw err
        continue
      }
    }
    await page.close()
  } finally {
    await context.close()
  }
  return results
}

export async function searchLinkedIn(query: string, location: string, headless: boolean): Promise<JobListing[]> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new LinkedInError(`LinkedIn search timed out after ${SEARCH_TIMEOUT_MS / 1000}s`, 'timeout')), SEARCH_TIMEOUT_MS)
  )
  return Promise.race([doLinkedInSearch(query, location, headless), timeout])
}
