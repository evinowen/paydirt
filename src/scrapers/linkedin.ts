import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { BaseScraper } from './base'
import { AutomationContext, JobPosting, SearchOptions } from './types'
import { LinkedInConfig } from '../config/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SESSION_PATH = path.resolve('sessions', 'linkedin.json')

const SEL = {
  usernameInput: '#username',
  passwordInput: '#password',
  loginButton: 'button[type="submit"]',
  verifyInput:
    'input[autocomplete="one-time-code"], input#input__email_verification_pin, input[name="pin"]',
  jobCards: '.job-card-container',
  jobTitle:
    '.job-card-list__title--link, .job-card-list__title, a.job-card-container__link strong',
  jobCompany:
    '.job-card-container__company-name, .artdeco-entity-lockup__subtitle span, .job-card-container__primary-description',
  jobLocation:
    '.job-card-container__metadata-item, .artdeco-entity-lockup__caption li, .job-card-container__metadata-wrapper li',
  jobLink:
    'a.job-card-list__title--link, a.job-card-list__title, a.job-card-container__link, a[href*="/jobs/view/"]',
  easyApplyBadge: '.job-card-container__apply-method',
}

export class LinkedInScraper extends BaseScraper {
  constructor(private config: LinkedInConfig) {
    super()
  }

  async search(options: SearchOptions, ctx: AutomationContext = {}): Promise<JobPosting[]> {
    const { log = () => {}, promptCode } = ctx
    const page = await this.launch(true, SESSION_PATH)
    const jobs: JobPosting[] = []

    try {
      log('LinkedIn: checking session...')
      await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded' })

      if (!/linkedin\.com\/(feed|jobs|mynetwork)/.test(page.url())) {
        log('LinkedIn: session expired or not found, logging in...')
        await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' })
        await page.waitForSelector(SEL.usernameInput, { timeout: 15000 })

        log('LinkedIn: entering credentials...')
        await page.fill(SEL.usernameInput, this.config.email)
        await page.fill(SEL.passwordInput, this.config.password)
        await page.click(SEL.loginButton)

        log('LinkedIn: waiting for login response...')
        await page.waitForURL(
          /linkedin\.com\/(feed|jobs|mynetwork|checkpoint|challenge|pin|verification)/,
          { timeout: 30000 },
        )

        if (/checkpoint|challenge|pin|verification/.test(page.url())) {
          log('LinkedIn: email verification required — check your inbox', 'warn')
          if (!promptCode)
            throw new Error(
              'LinkedIn requires email verification but no prompt handler is available',
            )
          const code = await promptCode('linkedin')
          await page.fill(SEL.verifyInput, code)
          await page.click(SEL.loginButton)
          log('LinkedIn: submitting verification code, waiting for login...')
          await page.waitForURL(/linkedin\.com\/(feed|jobs|mynetwork)/, { timeout: 30000 })
        }

        log('LinkedIn: saving session...')
        fs.mkdirSync(path.dirname(SESSION_PATH), { recursive: true })
        await this.context!.storageState({ path: SESSION_PATH })
      }

      log('LinkedIn: logged in')

      const maxPages = options.max_pages ?? 5
      const pageSize = 25

      for (const keyword of options.keywords) {
        log(`LinkedIn: searching for "${keyword}" in ${options.location}...`)
        const baseUrl = new URL('https://www.linkedin.com/jobs/search/')
        baseUrl.searchParams.set('keywords', keyword)
        baseUrl.searchParams.set('location', options.location)
        if (options.remote) baseUrl.searchParams.set('f_WT', '2')

        for (let pageNum = 0; pageNum < maxPages; pageNum++) {
          baseUrl.searchParams.set('start', String(pageNum * pageSize))
          await page.goto(baseUrl.toString(), { waitUntil: 'domcontentloaded' })
          await page.waitForSelector(SEL.jobCards, { timeout: 15000 }).catch(() => {})

          const cards = await page.$$(SEL.jobCards)
          log(`LinkedIn: page ${pageNum + 1} — ${cards.length} card(s) for "${keyword}"`)
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
            const href = await card
              .$eval(SEL.jobLink, (el: Element) => (el as HTMLAnchorElement).href)
              .catch(() => '')
            const easyApply = await card
              .$eval(SEL.easyApplyBadge, (el) => el.textContent?.includes('Easy Apply') ?? false)
              .catch(() => false)

            if (title && company && href) {
              const now = new Date()
              jobs.push({
                id: uuidv4(),
                title,
                company,
                location,
                url: href,
                easyApply,
                description: '',
                source: 'linkedin',
                foundAt: now,
                fetchedAt: now,
                status: 'new',
                isNew: true,
              })
            } else {
              const missing = [!title && 'title', !company && 'company', !href && 'url']
                .filter(Boolean)
                .join(', ')
              log(`LinkedIn: skipped card — could not extract: ${missing}`, 'warn')
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

  async fetchDescription(url: string, ctx: AutomationContext = {}): Promise<string> {
    const { log = () => {} } = ctx
    const page = await this.launch(true, SESSION_PATH)
    try {
      log(`LinkedIn: fetching description from ${url}`)
      await page.goto(url, { waitUntil: 'load' })

      await page.waitForSelector('[data-testid="expandable-text-box"]', { timeout: 10000 }).catch(() => {})

      // Expand collapsed description if the button is present
      await page.locator('[data-testid="expandable-text-button"]').click({ timeout: 3000 }).catch(() => {})

      await page.addScriptTag({ path: path.join(__dirname, 'linkedin-desc-extractor.js') })
      const desc = await page
        .evaluate(() => (window as { __extractLinkedInDescription?: () => string }).__extractLinkedInDescription?.() ?? '')
        .catch((err) => { log(`LinkedIn: description parse error: ${err}`, 'error'); return '' })
      return typeof desc === 'string' ? desc : ''
    } finally {
      await this.close()
    }
  }
}
