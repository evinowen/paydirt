import { v4 as uuidv4 } from 'uuid'
import { BaseScraper } from './base'
import { JobPosting, PromptCodeFn, SearchOptions } from './types'
import { LinkedInConfig } from '../config/types'

const SEL = {
  usernameInput: '#username',
  passwordInput: '#password',
  loginButton: 'button[type="submit"]',
  verifyInput: 'input[autocomplete="one-time-code"], input#input__email_verification_pin, input[name="pin"]',
  jobCards: '.job-card-container',
  jobTitle: '.job-card-list__title',
  jobCompany: '.job-card-container__company-name',
  jobLocation: '.job-card-container__metadata-item',
  jobLink: 'a.job-card-list__title',
  easyApplyBadge: '.job-card-container__apply-method',
}

export class LinkedInScraper extends BaseScraper {
  constructor(private config: LinkedInConfig) {
    super()
  }

  async search(options: SearchOptions, promptCode?: PromptCodeFn): Promise<JobPosting[]> {
    const page = await this.launch(true)
    const jobs: JobPosting[] = []

    try {
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle' })
      await page.fill(SEL.usernameInput, this.config.email)
      await page.fill(SEL.passwordInput, this.config.password)
      await page.click(SEL.loginButton)
      await page.waitForLoadState('domcontentloaded')

      if (/checkpoint|challenge|pin|verification/.test(page.url())) {
        if (!promptCode) throw new Error('LinkedIn requires email verification but no prompt handler is available')
        const code = await promptCode('linkedin')
        await page.fill(SEL.verifyInput, code)
        await page.click(SEL.loginButton)
      }

      await page.waitForURL(/linkedin\.com\/(feed|jobs)/, { timeout: 30000 })

      for (const keyword of options.keywords) {
        const url = new URL('https://www.linkedin.com/jobs/search/')
        url.searchParams.set('keywords', keyword)
        url.searchParams.set('location', options.location)
        if (options.remote) url.searchParams.set('f_WT', '2')

        await page.goto(url.toString(), { waitUntil: 'networkidle' })
        await page.waitForTimeout(2000)

        const cards = await page.$$(SEL.jobCards)
        for (const card of cards.slice(0, 25)) {
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
            jobs.push({
              id: uuidv4(),
              title,
              company,
              location,
              url: href,
              easyApply,
              description: '',
              source: 'linkedin',
              foundAt: new Date(),
              status: 'new',
            })
          }
        }
      }
    } finally {
      await this.close()
    }

    return this.applyFilters(jobs, options)
  }
}
