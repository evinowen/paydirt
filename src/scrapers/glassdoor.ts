import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { BaseScraper } from './base'
import { AutomationContext, JobPosting, SearchOptions } from './types'
import { PlatformConfig } from '../config/types'

const SESSION_PATH = path.resolve('sessions', 'glassdoor.json')

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

  async search(options: SearchOptions, ctx: AutomationContext = {}): Promise<JobPosting[]> {
    const { log = () => {} } = ctx
    const page = await this.launch(true, SESSION_PATH)
    const jobs: JobPosting[] = []

    try {
      log('Glassdoor: checking session...')
      await page.goto('https://www.glassdoor.com/member/home/index.htm', {
        waitUntil: 'domcontentloaded',
      })

      if (!/glassdoor\.com\/member/.test(page.url())) {
        log('Glassdoor: session expired or not found, logging in...')
        await page.goto('https://www.glassdoor.com/profile/login_input.htm', {
          waitUntil: 'domcontentloaded',
        })
        await page.waitForSelector(SEL.emailInput, { timeout: 15000 })
        log('Glassdoor: entering credentials...')
        await page.fill(SEL.emailInput, this.config.email)
        await page.click(SEL.continueButton)
        await page.waitForTimeout(1000)
        await page.fill(SEL.passwordInput, this.config.password)
        await page.click(SEL.signInButton)
        log('Glassdoor: waiting for login response...')
        await page.waitForURL(/glassdoor\.com\/(Jobs|member)/, { timeout: 20000 })

        log('Glassdoor: saving session...')
        fs.mkdirSync(path.dirname(SESSION_PATH), { recursive: true })
        await this.context!.storageState({ path: SESSION_PATH })
      }

      log('Glassdoor: logged in')

      for (const keyword of options.keywords) {
        log(`Glassdoor: searching for "${keyword}" in ${options.location}...`)
        const url = new URL('https://www.glassdoor.com/Job/jobs.htm')
        url.searchParams.set('sc.keyword', keyword)
        url.searchParams.set('locKeyword', options.location)
        if (options.remote) url.searchParams.set('remoteWorkType', '1')

        await page.goto(url.toString(), { waitUntil: 'domcontentloaded' })
        await page.waitForSelector(SEL.jobCards, { timeout: 15000 }).catch(() => {})

        const cards = await page.$$(SEL.jobCards)
        log(`Glassdoor: found ${cards.length} card(s) for "${keyword}", extracting details...`)
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

  async fetchDescription(url: string): Promise<string> {
    const page = await this.launch(true, SESSION_PATH)
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      return await page
        .$eval(
          '[class*="JobDetails_jobDescription"], #JobDescriptionContainer',
          (el) => el.textContent?.trim() ?? '',
        )
        .catch(() => '')
    } finally {
      await this.close()
    }
  }
}
