import { chromium } from 'playwright'

export interface ScrapedJob {
  url: string
  company: string
  title: string
  location: string
  postedDate: string
  description: string
}

// URL path segments that indicate a non-job page even if /careers/ appears in the href
const NON_JOB_PATH_SEGMENTS = [
  '/life-at-', '/work-at-', '/about', '/blog', '/engineering', '/press',
  '/news', '/culture', '/values', '/benefits', '/diversity', '/leadership',
  '/team', '/product/', '/platform/', '/security/', '/pricing', '/analyst',
  '/developer.spotify', 'engineering.at'
]

// Return the main brand name from any careers/jobs subdomain URL
function extractCompanyName(careerPageUrl: string): string {
  try {
    const hostname = new URL(careerPageUrl).hostname.replace('www.', '')
    const parts = hostname.split('.')
    // For e.g. jobs.apple.com or careers.datadoghq.com, take the second-to-last before the TLD
    return parts.length >= 3 ? parts[parts.length - 2] : parts[0]
  } catch {
    return 'Unknown'
  }
}

function isSameDomain(base: string, link: string): boolean {
  try {
    const baseHost = new URL(base).hostname.replace('www.', '')
    const linkHost = new URL(link).hostname.replace('www.', '')
    // Allow same host or known ATS platforms
    return (
      linkHost === baseHost ||
      linkHost.endsWith('.' + baseHost) ||
      baseHost.endsWith('.' + linkHost) ||
      linkHost.includes('greenhouse.io') ||
      linkHost.includes('lever.co') ||
      linkHost.includes('workday.com') ||
      linkHost.includes('myworkdayjobs.com') ||
      linkHost.includes('smartrecruiters.com') ||
      linkHost.includes('ashbyhq.com')
    )
  } catch {
    return false
  }
}

function looksLikeJobUrl(href: string): boolean {
  const lower = href.toLowerCase()
  if (NON_JOB_PATH_SEGMENTS.some((seg) => lower.includes(seg))) return false
  return (
    lower.includes('/job') ||
    lower.includes('/position') ||
    lower.includes('/opening') ||
    lower.includes('/role') ||
    lower.includes('/vacancy') ||
    lower.includes('/details/') ||
    lower.includes('jobid') ||
    lower.includes('job_id') ||
    lower.includes('greenhouse.io') ||
    lower.includes('lever.co') ||
    lower.includes('workday.com') ||
    lower.includes('myworkdayjobs.com') ||
    lower.includes('smartrecruiters.com') ||
    lower.includes('ashbyhq.com')
  )
}

function looksLikeJobPosting(text: string, title: string): boolean {
  // Reject obvious non-job page titles up front
  if (/^(blog|home|search jobs|jobs?$|engineering$|careers?$|spotlight|rovo|newsletter|about|news|press|analyst|leadership|products?$|platform$|security$|pricing$)/i.test(title.trim())) return false
  const lower = (text + ' ' + title).toLowerCase()
  // Must have at least two of these markers to be treated as a real job posting
  const markers = ['responsibilit', 'requirement', 'qualif', 'apply', 'we are looking', 'you will', 'your role', 'what you', 'job description', 'about the role', "we're looking", 'the opportunity', 'who you are']
  return markers.filter((m) => lower.includes(m)).length >= 2
}

export async function scrapeCompanyCareerPage(
  careerPageUrl: string,
  keywords: string[],
  headless: boolean,
  signal?: AbortSignal
): Promise<ScrapedJob[]> {
  const browser = await chromium.launch({ headless, args: ['--no-sandbox'] })
  // Close the browser immediately if the caller has already aborted
  signal?.addEventListener('abort', () => { browser.close().catch(() => {}) })
  if (signal?.aborted) { await browser.close(); return [] }

  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' })
  const page = await context.newPage()
  const results: ScrapedJob[] = []
  const company = extractCompanyName(careerPageUrl)

  try {
    await page.goto(careerPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    const links = await page.$$eval('a[href]', (els) =>
      els.map((el) => ({ href: (el as HTMLAnchorElement).href, text: el.textContent?.trim() || '' }))
        .filter((l) => l.text.length > 3 && l.text.length < 200 && l.href.startsWith('http'))
    )

    const titleKeywords = ['engineer', 'developer', 'manager', 'designer', 'analyst', 'scientist',
      'lead', 'senior', 'junior', 'director', 'specialist', 'coordinator', 'architect', ...keywords]

    const jobLinks = links.filter((l) => {
      if (!isSameDomain(careerPageUrl, l.href)) return false
      const textLower = l.text.toLowerCase()
      const hasJobTitle = titleKeywords.some((k) => textLower.includes(k.toLowerCase()))
      const hasJobUrl = looksLikeJobUrl(l.href)
      return hasJobTitle || hasJobUrl
    })

    const uniqueUrls = [...new Set(jobLinks.map((l) => l.href))].slice(0, 15)

    for (const jobUrl of uniqueUrls) {
      try {
        if (jobUrl === careerPageUrl) continue
        const jobPage = await context.newPage()
        await jobPage.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await jobPage.waitForTimeout(1000)

        const title = await jobPage.title().then((t) => t.replace(/[\|\-–—].*/, '').trim())
        const description = await jobPage.$eval('main, article, [class*="job"], [class*="position"]', (el) => el.textContent?.trim() || '').catch(async () =>
          jobPage.$eval('body', (el) => el.textContent?.trim().substring(0, 5000) || '').catch(() => '')
        )

        if (title && description.length > 100 && looksLikeJobPosting(description, title)) {
          results.push({ url: jobUrl, company, title, location: '', postedDate: new Date().toISOString(), description: description.substring(0, 5000) })
        }

        await jobPage.close()
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 500))
      } catch { continue }
    }
  } catch (err) {
    console.error(`Error scraping ${careerPageUrl}:`, err)
  } finally {
    await page.close()
    await context.close()
    await browser.close()
  }
  return results
}
