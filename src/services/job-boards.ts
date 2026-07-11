import { chromium } from 'playwright'

export interface JobBoardListing {
  url: string
  company: string
  title: string
  location: string
  postedDate: string
  description: string
}

interface BoardConfig {
  name: string
  buildUrl: (query: string, location: string) => string
  extractListings: (page: import('playwright').Page) => Promise<Array<{ url: string; title: string; company: string; location: string }>>
  extractDescription: (page: import('playwright').Page) => Promise<string>
}

const BOARDS: BoardConfig[] = [
  {
    name: 'indeed',
    buildUrl: (query, location) =>
      `https://de.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&sort=date&fromage=14`,
    extractListings: async (page) => {
      await page.waitForSelector('[data-jk], .job_seen_beacon', { timeout: 10000 }).catch(() => {})
      return page.$$eval('[data-jk]', (cards) =>
        cards.slice(0, 15).map((card) => ({
          url: (card.querySelector('a.jcs-JobTitle, a[data-jk]') as HTMLAnchorElement)?.href || '',
          title: card.querySelector('[class*="jobTitle"], h2')?.textContent?.trim() || '',
          company: card.querySelector('[data-testid="company-name"], .companyName')?.textContent?.trim() || '',
          location: card.querySelector('[data-testid="text-location"], .companyLocation')?.textContent?.trim() || '',
        }))
      ).catch(() => [])
    },
    extractDescription: async (page) => {
      await page.waitForSelector('#jobDescriptionText, [class*="jobsearch-jobDescriptionText"]', { timeout: 8000 }).catch(() => {})
      return page.$eval('#jobDescriptionText, [class*="jobsearch-jobDescriptionText"]', (el) => el.textContent?.trim() || '').catch(() => '')
    },
  },
  {
    name: 'stepstone',
    buildUrl: (query, location) =>
      `https://www.stepstone.de/jobs/${encodeURIComponent(query.replace(/ /g, '-'))}/in-${encodeURIComponent(location.replace(/ /g, '-'))}?dateRange=14&orderBy=date`,
    extractListings: async (page) => {
      await page.waitForSelector('[data-at="job-item"], article[class*="JobCard"]', { timeout: 10000 }).catch(() => {})
      return page.$$eval('[data-at="job-item"], article[class*="JobCard"]', (cards) =>
        cards.slice(0, 15).map((card) => ({
          url: (card.querySelector('a[data-at="job-item-title"], a[class*="JobCard"]') as HTMLAnchorElement)?.href || '',
          title: card.querySelector('[data-at="job-item-title"], h2')?.textContent?.trim() || '',
          company: card.querySelector('[data-at="job-item-company-name"], [class*="company"]')?.textContent?.trim() || '',
          location: card.querySelector('[data-at="job-item-location"], [class*="location"]')?.textContent?.trim() || '',
        }))
      ).catch(() => [])
    },
    extractDescription: async (page) => {
      // Stepstone uses data-at="jobdescription" on the description container; fall back to main
      const SELECTOR = '[data-at="jobdescription"], [class*="JobDescription"], [class*="job-description"], [class*="jobdescription"], main'
      await page.waitForSelector(SELECTOR, { timeout: 8000 }).catch(() => {})
      return page.$eval(SELECTOR, (el) => (el as HTMLElement).innerText?.trim() || '').catch(() => '')
    },
  },
]

// Playwright close() can hang indefinitely (notably on Windows), which is the
// most common way this scraper freezes with no error. Bound every close so a
// wedged teardown can't stall the whole run; the process exit reaps whatever
// browser process is left behind.
function closeQuietly(closable: { close: () => Promise<unknown> }, ms = 5000): Promise<unknown> {
  return Promise.race([
    closable.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ])
}

export async function searchJobBoards(
  queries: string[],
  locations: string[],
  enabledBoards: string[],
  headless: boolean,
  overallTimeoutMs = 300_000
): Promise<JobBoardListing[]> {
  const results: JobBoardListing[] = []
  const seen = new Set<string>()

  const boards = BOARDS.filter((b) => enabledBoards.includes(b.name))
  if (boards.length === 0) return results

  const browser = await chromium.launch({ headless, args: ['--no-sandbox'] })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
  })

  // Flipped by the wall-clock guard so the loops stop issuing new navigations.
  let finished = false

  const scrape = async (): Promise<void> => {
    try {
      for (const board of boards) {
        for (const query of queries.slice(0, 2)) {
          for (const location of locations.slice(0, 2)) {
            if (finished) return
            console.log(`  [${board.name}] Searching "${query}" in "${location}"...`)
            const listPage = await context.newPage()
            try {
              await listPage.goto(board.buildUrl(query, location), { waitUntil: 'domcontentloaded', timeout: 25000 })
              await listPage.waitForTimeout(2000)
              const listings = await board.extractListings(listPage)
              console.log(`    → ${listings.length} listing(s) found`)

              for (const item of listings) {
                if (finished) break
                if (!item.url || !item.title || seen.has(item.url)) continue
                seen.add(item.url)

                const detailPage = await context.newPage()
                try {
                  await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
                  await detailPage.waitForTimeout(1000)
                  const description = await board.extractDescription(detailPage)
                  if (description.length > 100) {
                    results.push({
                      url: item.url,
                      company: item.company || 'Unknown',
                      title: item.title,
                      location: item.location,
                      postedDate: new Date().toISOString(),
                      description: description.substring(0, 5000),
                    })
                  }
                } catch { /* skip this listing */ } finally {
                  await closeQuietly(detailPage)
                }
                await new Promise((r) => setTimeout(r, 800 + Math.random() * 600))
              }
            } catch (err) {
              console.warn(`    → [${board.name}] search failed: ${String(err)}`)
            } finally {
              await closeQuietly(listPage)
            }
          }
        }
      }
    } catch { /* browser force-closed by the guard below — return what we have */ }
  }

  // Overall wall-clock guard. Per-page gotos have their own timeouts, but a
  // stuck close() or an unresponsive site can still hang the run with no error.
  // If the budget is exceeded, stop waiting and return partial results —
  // runSearch continues to scoring rather than freezing.
  let guard: NodeJS.Timeout | undefined
  const budget = new Promise<void>((resolve) => {
    guard = setTimeout(() => {
      finished = true
      console.warn(`    → job board search exceeded ${Math.round(overallTimeoutMs / 1000)}s; abandoning and closing browser`)
      resolve()
    }, overallTimeoutMs)
  })

  try {
    await Promise.race([scrape().then(() => { finished = true }), budget])
  } finally {
    if (guard) clearTimeout(guard)
    await closeQuietly(context)
    await closeQuietly(browser)
  }

  return results
}
