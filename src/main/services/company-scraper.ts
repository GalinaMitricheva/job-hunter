import { chromium } from 'playwright'

interface ScrapedJob {
  url: string
  company: string
  title: string
  location: string
  postedDate: string
  description: string
}

function extractCompanyName(pageUrl: string): string {
  try {
    const u = new URL(pageUrl)
    return u.hostname.replace('www.', '').split('.')[0]
  } catch {
    return 'Unknown'
  }
}

export async function scrapeCompanyCareerPage(
  careerPageUrl: string,
  keywords: string[],
  headless: boolean
): Promise<ScrapedJob[]> {
  const browser = await chromium.launch({
    headless,
    args: ['--no-sandbox']
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  })
  const page = await context.newPage()
  const results: ScrapedJob[] = []
  const company = extractCompanyName(careerPageUrl)

  try {
    await page.goto(careerPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    const links = await page.$$eval('a[href]', (els) =>
      els
        .map((el) => ({
          href: (el as HTMLAnchorElement).href,
          text: el.textContent?.trim() || ''
        }))
        .filter((l) => l.text.length > 5 && l.text.length < 200)
    )

    const jobKeywords = ['engineer', 'developer', 'manager', 'designer', 'analyst', 'scientist',
      'lead', 'senior', 'junior', 'director', 'specialist', 'coordinator', 'architect', ...keywords]

    const jobLinks = links.filter((l) => {
      const textLower = l.text.toLowerCase()
      const hrefLower = l.href.toLowerCase()
      return (
        jobKeywords.some((k) => textLower.includes(k)) ||
        hrefLower.includes('/jobs/') ||
        hrefLower.includes('/careers/') ||
        hrefLower.includes('/opening') ||
        hrefLower.includes('greenhouse.io') ||
        hrefLower.includes('lever.co') ||
        hrefLower.includes('workday.com')
      )
    })

    const uniqueUrls = [...new Set(jobLinks.map((l) => l.href))].slice(0, 15)

    for (const jobUrl of uniqueUrls) {
      try {
        if (jobUrl === careerPageUrl) continue
        const jobPage = await context.newPage()
        await jobPage.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await jobPage.waitForTimeout(1000)

        const title = await jobPage.title().then((t) => t.replace(/[\|\-–—].*/, '').trim())
        const description = await jobPage.$eval('main, article, [class*="job"], [class*="position"]', (el) => el.textContent?.trim() || '').catch(() => '')

        if (title && description.length > 100) {
          results.push({
            url: jobUrl,
            company,
            title,
            location: '',
            postedDate: new Date().toISOString(),
            description: description.substring(0, 5000)
          })
        }

        await jobPage.close()
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 500))
      } catch {
        continue
      }
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
