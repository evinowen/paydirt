import { Page } from 'playwright'
import { BaseApplicator, ApplicationResult } from './base'
import { AutomationContext, JobPosting } from '../scrapers/types'
import { ResumeData } from '../resume/parser'
import { PlatformConfig } from '../config/types'

export class IndeedApplicator extends BaseApplicator {
  constructor(private _config: PlatformConfig) {
    super()
  }

  async apply(job: JobPosting, resume: ResumeData, _ctx: AutomationContext = {}): Promise<ApplicationResult> {
    const page = await this.launch(false)

    try {
      await page.goto(job.url, { waitUntil: 'networkidle' })

      const applyBtn = page.locator('button:has-text("Apply now"), a:has-text("Apply now")').first()
      if (!(await applyBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        return { success: false, message: 'No apply button found' }
      }
      await applyBtn.click()
      await page.waitForTimeout(2000)

      for (let step = 0; step < 10; step++) {
        await this.fillStep(page, resume)

        const submitBtn = page.locator('button:has-text("Submit")').first()
        const continueBtn = page.locator('button:has-text("Continue")').first()

        if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await submitBtn.click()
          await page.waitForTimeout(2000)
          return { success: true, message: 'Application submitted' }
        } else if (await continueBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await continueBtn.click()
        } else {
          break
        }

        await page.waitForTimeout(1000)
      }

      return { success: false, message: 'Could not complete application flow' }
    } catch (err) {
      return { success: false, message: String(err) }
    } finally {
      await this.close()
    }
  }

  private async fillStep(page: Page, resume: ResumeData): Promise<void> {
    if (resume.name) {
      const [firstName, ...rest] = resume.name.split(' ')
      await this.fillField(page, 'input[name="firstName"]', firstName)
      await this.fillField(page, 'input[name="lastName"]', rest.join(' '))
    }
    if (resume.email) await this.fillField(page, 'input[name="email"]', resume.email)
    if (resume.phone) await this.fillField(page, 'input[name="phoneNumber"]', resume.phone)

    const fileInput = page.locator('input[type="file"]').first()
    if (await fileInput.isVisible({ timeout: 500 }).catch(() => false)) {
      await fileInput.setInputFiles(resume.path)
      await page.waitForTimeout(1500)
    }
  }
}
