import { Browser, BrowserContext, Page, chromium } from 'playwright'
import { JobPosting, PromptCodeFn } from '../scrapers/types'
import { ResumeData } from '../resume/parser'

export interface ApplicationResult {
  success: boolean
  message: string
}

export abstract class BaseApplicator {
  protected browser: Browser | null = null
  protected context: BrowserContext | null = null

  abstract apply(job: JobPosting, resume: ResumeData, promptCode?: PromptCodeFn): Promise<ApplicationResult>

  protected async launch(headless = false): Promise<Page> {
    this.browser = await chromium.launch({
      headless,
      args: ['--no-sandbox'],
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

  protected async fillField(page: Page, selector: string, value: string): Promise<void> {
    try {
      await page.waitForSelector(selector, { timeout: 3000 })
      await page.fill(selector, '')
      await page.fill(selector, value)
    } catch {
      // Field may not exist in this step
    }
  }
}
