import { Page } from 'playwright';
import { BaseApplicator, ApplicationResult } from './base';
import { JobPosting } from '../scrapers/types';
import { ResumeData } from '../resume/parser';
import { LinkedInConfig } from '../config/types';

export class LinkedInApplicator extends BaseApplicator {
  constructor(private config: LinkedInConfig) {
    super();
  }

  async apply(job: JobPosting, resume: ResumeData): Promise<ApplicationResult> {
    const page = await this.launch(false);

    try {
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle' });
      await page.fill('#username', this.config.email);
      await page.fill('#password', this.config.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(/linkedin\.com\/(feed|jobs)/, { timeout: 20000 });

      await page.goto(job.url, { waitUntil: 'networkidle' });

      const easyApplyBtn = page.locator('button:has-text("Easy Apply")').first();
      if (!await easyApplyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        return { success: false, message: 'No Easy Apply button found — manual application required' };
      }

      await easyApplyBtn.click();
      await page.waitForTimeout(1500);

      for (let step = 0; step < 10; step++) {
        await this.fillStep(page, resume);

        const submitBtn = page.locator('button:has-text("Submit application")').first();
        const reviewBtn = page.locator('button:has-text("Review")').first();
        const nextBtn = page.locator('button:has-text("Next")').first();

        if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await submitBtn.click();
          await page.waitForTimeout(2000);
          return { success: true, message: 'Application submitted' };
        } else if (await reviewBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await reviewBtn.click();
        } else if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await nextBtn.click();
        } else {
          break;
        }

        await page.waitForTimeout(1000);
      }

      return { success: false, message: 'Could not complete application flow' };
    } catch (err) {
      return { success: false, message: String(err) };
    } finally {
      await this.close();
    }
  }

  private async fillStep(page: Page, resume: ResumeData): Promise<void> {
    if (resume.phone) await this.fillField(page, 'input[id*="phoneNumber"]', resume.phone);
    if (resume.email) await this.fillField(page, 'input[id*="email"]', resume.email);

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible({ timeout: 500 }).catch(() => false)) {
      await fileInput.setInputFiles(resume.path);
      await page.waitForTimeout(1000);
    }

    // Answer yes/no questions with "Yes" by default
    const yesLabels = page.locator('label:has-text("Yes")');
    const yesCount = await yesLabels.count();
    for (let i = 0; i < yesCount; i++) {
      await yesLabels.nth(i).click().catch(() => {});
    }

    // Fill numeric experience fields with a reasonable default
    const numInputs = page.locator('input[type="text"][id*="numericInput"]');
    const numCount = await numInputs.count();
    for (let i = 0; i < numCount; i++) {
      const current = await numInputs.nth(i).inputValue().catch(() => '');
      if (!current) await numInputs.nth(i).fill('3').catch(() => {});
    }
  }
}
