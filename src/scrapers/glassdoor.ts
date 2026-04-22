import { v4 as uuidv4 } from 'uuid'
import { BaseScraper } from './base'
import { JobPosting, SearchOptions } from './types'
import { PlatformConfig } from '../config/types'

const SEL = {
  emailInput: '#inlineUserEmail',
  continueButton: 'button[data-test="email-form-button"]',
  passwordInput: '#inlineUserPassword',
  signInButton: 'button[data-test="submit-btn"]',
  jobCards: '[data-test="jobListing"]',
  jobTitle: '[data-test="job-title"]',
  jobCompany: '[data-test="employer-name"]',
  jobLocation: '[data-test="emp-location"]',
  jobLink: 'a[data-test="job-title"]',
}

export class GlassdoorScraper extends BaseScraper {
  constructor(private config: PlatformConfig) {
    super()
  }

  async search(options: SearchOptions): Promise<JobPosting[]> {
    const page = await this.launch(true)
    const jobs: JobPosting[] = []

    try {
      await page.goto('https://www.glassdoor.com/profile/login_input.htm', {
        waitUntil: 'networkidle',
      })
      await page.fill(SEL.emailInput, this.config.email)
      await page.click(SEL.continueButton)
      await page.waitForTimeout(1000)
      await page.fill(SEL.passwordInput, this.config.password)
      await page.click(SEL.signInButton)
      await page.waitForURL(/glassdoor\.com\/(Jobs|member)/, { timeout: 20000 })

      for (const keyword of options.keywords) {
        const url = new URL('https://www.glassdoor.com/Job/jobs.htm')
        url.searchParams.set('sc.keyword', keyword)
        url.searchParams.set('locKeyword', options.location)
        if (options.remote) url.searchParams.set('remoteWorkType', '1')

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

          if (title && company && href) {
            jobs.push({
              id: uuidv4(),
              title,
              company,
              location,
              url: href,
              easyApply: false,
              description: '',
              source: 'glassdoor',
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
