import { Browser, BrowserContext, Page, chromium } from 'playwright'
import { JobPosting, SearchOptions } from './types'

export abstract class BaseScraper {
  protected browser: Browser | null = null
  protected context: BrowserContext | null = null

  abstract search(options: SearchOptions): Promise<JobPosting[]>

  protected async launch(headless = true): Promise<Page> {
    this.browser = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    })
    return this.context.newPage()
  }

  protected async close(): Promise<void> {
    await this.context?.close()
    await this.browser?.close()
    this.browser = null
    this.context = null
  }

  protected applyFilters(jobs: JobPosting[], options: SearchOptions): JobPosting[] {
    return jobs.filter((job) => {
      if (
        options.exclude_companies?.some((c) => job.company.toLowerCase().includes(c.toLowerCase()))
      )
        return false
      if (
        options.exclude_keywords?.some(
          (k) =>
            job.title.toLowerCase().includes(k.toLowerCase()) ||
            job.description.toLowerCase().includes(k.toLowerCase()),
        )
      )
        return false
      return true
    })
  }
}
