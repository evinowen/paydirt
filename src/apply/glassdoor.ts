import { BaseApplicator, ApplicationResult } from './base';
import { JobPosting } from '../scrapers/types';
import { ResumeData } from '../resume/parser';
import { PlatformConfig } from '../config/types';

export class GlassdoorApplicator extends BaseApplicator {
  constructor(private _config: PlatformConfig) {
    super();
  }

  async apply(job: JobPosting, resume: ResumeData): Promise<ApplicationResult> {
    const page = await this.launch(false);

    try {
      await page.goto(job.url, { waitUntil: 'networkidle' });

      const applyBtn = page.locator('button:has-text("Apply Now"), a:has-text("Apply Now")').first();
      if (!await applyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        return { success: false, message: 'No apply button found' };
      }

      // Glassdoor usually opens the company's ATS in a new tab
      const [newPage] = await Promise.all([
        page.context().waitForEvent('page'),
        applyBtn.click(),
      ]);

      await newPage.waitForLoadState('networkidle');

      if (resume.name) {
        const [firstName, ...rest] = resume.name.split(' ');
        await this.fillField(newPage, 'input[name="firstName"], input[id*="first"]', firstName);
        await this.fillField(newPage, 'input[name="lastName"], input[id*="last"]', rest.join(' '));
      }
      if (resume.email) await this.fillField(newPage, 'input[name="email"], input[type="email"]', resume.email);
      if (resume.phone) await this.fillField(newPage, 'input[name="phone"], input[name="phoneNumber"]', resume.phone);

      const fileInput = newPage.locator('input[type="file"]').first();
      if (await fileInput.isVisible({ timeout: 500 }).catch(() => false)) {
        await fileInput.setInputFiles(resume.path);
      }

      return { success: true, message: 'Application started — external ATS opened, manual completion may be needed' };
    } catch (err) {
      return { success: false, message: String(err) };
    } finally {
      await this.close();
    }
  }
}
