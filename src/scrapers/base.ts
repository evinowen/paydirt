import fs from 'fs'
import { Browser, BrowserContext, Page, chromium } from 'playwright'
import { AutomationContext, JobPosting, SearchOptions } from './types'

export abstract class BaseScraper {
  protected browser: Browser | null = null
  protected context: BrowserContext | null = null

  abstract search(options: SearchOptions, ctx?: AutomationContext): Promise<JobPosting[]>

  async checkJobsBatch(urls: string[], ctx: AutomationContext = {}): Promise<Map<string, boolean>> {
    const { log = () => {} } = ctx
    const results = new Map<string, boolean>()
    if (urls.length === 0) return results
    const page = await this.launch(true)
    try {
      for (const url of urls) {
        try {
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
          const status = response?.status() ?? 0
          results.set(url, status < 400)
        } catch {
          log(`check failed for ${url}, assuming closed`, 'warn')
          results.set(url, false)
        }
      }
    } finally {
      await this.close()
    }
    return results
  }

  protected async launch(headless = true, storageStatePath?: string): Promise<Page> {
    this.browser = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    const storageState =
      storageStatePath && fs.existsSync(storageStatePath) ? storageStatePath : undefined
    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      storageState,
      bypassCSP: true,
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
