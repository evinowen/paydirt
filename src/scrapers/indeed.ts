import { v4 as uuidv4 } from 'uuid'
import { BaseScraper } from './base'
import { AutomationContext, JobPosting, SearchOptions } from './types'
import { PlatformConfig } from '../config/types'

const SEL = {
  jobCards: '.job_seen_beacon',
  jobTitle: '[data-testid="jobTitle"]',
  jobCompany: '[data-testid="company-name"]',
  jobLocation: '[data-testid="text-location"]',
  jobSalary: '[data-testid="attribute_snippet_testid"]',
  jobLink: 'a[data-testid="job-title-link"]',
}

export class IndeedScraper extends BaseScraper {
  constructor(private _config: PlatformConfig) {
    super()
  }

  async search(options: SearchOptions, ctx: AutomationContext = {}): Promise<JobPosting[]> {
    const { log = () => {} } = ctx
    const page = await this.launch(true)
    const jobs: JobPosting[] = []

    try {
      const maxPages = options.max_pages ?? 5
      const pageSize = 10

      for (const keyword of options.keywords) {
        log(`Indeed: searching for "${keyword}" in ${options.location}...`)
        const baseUrl = new URL('https://www.indeed.com/jobs')
        baseUrl.searchParams.set('q', keyword)
        baseUrl.searchParams.set('l', options.location)
        if (options.remote)
          baseUrl.searchParams.set('remotejob', '032b3046-06a3-4876-8dfd-474eb5e7ed11')

        for (let pageNum = 0; pageNum < maxPages; pageNum++) {
          baseUrl.searchParams.set('start', String(pageNum * pageSize))
          await page.goto(baseUrl.toString(), { waitUntil: 'domcontentloaded' })
          await page.waitForSelector(SEL.jobCards, { timeout: 15000 }).catch(() => {})

          const cards = await page.$$(SEL.jobCards)
          log(`Indeed: page ${pageNum + 1} — ${cards.length} card(s) for "${keyword}"`)
          if (cards.length === 0) break

          for (const card of cards) {
            const title = await card
              .$eval(SEL.jobTitle, (el) => el.textContent?.trim() ?? '')
              .catch(() => '')
            const company = await card
              .$eval(SEL.jobCompany, (el) => el.textContent?.trim() ?? '')
              .catch(() => '')
            const location = await card
              .$eval(SEL.jobLocation, (el) => el.textContent?.trim() ?? '')
              .catch(() => '')
            const salary = await card
              .$eval(SEL.jobSalary, (el) => el.textContent?.trim() ?? '')
              .catch(() => '')
            const href = await card
              .$eval(SEL.jobLink, (el: Element) => (el as HTMLAnchorElement).href)
              .catch(() => '')

            if (title && company && href) {
              const now = new Date()
              jobs.push({
                id: uuidv4(),
                title,
                company,
                location,
                salary: salary || undefined,
                url: href,
                easyApply: false,
                description: '',
                source: 'indeed',
                foundAt: now,
                fetchedAt: now,
                status: 'new',
                isNew: true,
              })
            }
          }

          if (cards.length < pageSize) break
        }
      }
    } finally {
      await this.close()
    }

    return this.applyFilters(jobs, options)
  }

  async fetchDescription(url: string): Promise<string> {
    const page = await this.launch(true)
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      return await page
        .$eval(
          '#jobDescriptionText, .jobsearch-JobComponent-description',
          (el) => el.textContent?.trim() ?? '',
        )
        .catch(() => '')
    } finally {
      await this.close()
    }
  }
}
