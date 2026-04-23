/**
 * Standalone scraper test — runs without the TUI so you can see raw output and diagnose failures.
 *
 * Usage:
 *   npx tsx scripts/test-scraper.ts [linkedin|indeed|glassdoor]
 *
 * If no scraper is specified, all enabled scrapers are tested.
 * Reads config.yaml from the project root (or pass a path as the second arg).
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { loadConfig } from '../src/config/loader.js'
import { LinkedInScraper } from '../src/scrapers/linkedin.js'
import { IndeedScraper } from '../src/scrapers/indeed.js'
import { GlassdoorScraper } from '../src/scrapers/glassdoor.js'
import { AutomationContext, JobPosting } from '../src/scrapers/types.js'
import readline from 'readline'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

function log(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
  const prefix = level === 'error' ? '  [ERROR]' : level === 'warn' ? '  [WARN] ' : '  [INFO] '
  console.log(`${prefix} ${msg}`)
}

async function promptCode(source: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`\n>>> ${source} verification code: `, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function printResults(source: string, jobs: JobPosting[]) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${source.toUpperCase()} — ${jobs.length} result(s)`)
  console.log('─'.repeat(60))
  if (jobs.length === 0) {
    console.log('  (no jobs found)')
    return
  }
  for (const [i, job] of jobs.entries()) {
    console.log(`  ${String(i + 1).padStart(3)}. ${job.title}`)
    console.log(`       ${job.company}  |  ${job.location}${job.easyApply ? '  [Easy Apply]' : ''}`)
    console.log(`       ${job.url}`)
  }
}

async function main() {
  const target = process.argv[2]?.toLowerCase()
  const configPath = process.argv[3] ?? path.join(projectRoot, 'config.yaml')

  let config
  try {
    config = loadConfig(configPath)
  } catch (err) {
    console.error(`Failed to load config from ${configPath}: ${err}`)
    process.exit(1)
  }

  const options = {
    keywords: config.search.keywords,
    location: config.search.location,
    remote: config.search.remote,
    salary_min: config.search.salary_min,
    experience_level: config.search.experience_level,
    exclude_companies: config.filters?.exclude_companies,
    exclude_keywords: config.filters?.exclude_keywords,
  }

  const ctx: AutomationContext = { log, promptCode }

  if ((!target || target === 'linkedin') && config.linkedin?.enabled) {
    console.log('\nTesting LinkedIn scraper...')
    try {
      const jobs = await new LinkedInScraper(config.linkedin).search(options, ctx)
      printResults('linkedin', jobs)
    } catch (err) {
      console.error(`LinkedIn scraper threw: ${err}`)
    }
  }

  if ((!target || target === 'indeed') && config.indeed?.enabled) {
    console.log('\nTesting Indeed scraper...')
    try {
      const jobs = await new IndeedScraper(config.indeed).search(options, ctx)
      printResults('indeed', jobs)
    } catch (err) {
      console.error(`Indeed scraper threw: ${err}`)
    }
  }

  if ((!target || target === 'glassdoor') && config.glassdoor?.enabled) {
    console.log('\nTesting Glassdoor scraper...')
    try {
      const jobs = await new GlassdoorScraper(config.glassdoor).search(options, ctx)
      printResults('glassdoor', jobs)
    } catch (err) {
      console.error(`Glassdoor scraper threw: ${err}`)
    }
  }

  if (target && !['linkedin', 'indeed', 'glassdoor'].includes(target)) {
    console.error(`Unknown scraper "${target}". Choose: linkedin, indeed, glassdoor`)
    process.exit(1)
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
