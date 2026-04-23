import { EventEmitter } from 'events'
import { Config } from '../config/types'
import { loadConfig, saveConfig, setConfigValue, getConfigValue } from '../config/loader'
import { ResumeData } from '../resume/parser'
import { JobPosting, SearchOptions } from '../scrapers/types'
import { LinkedInScraper } from '../scrapers/linkedin'
import { IndeedScraper } from '../scrapers/indeed'
import { GlassdoorScraper } from '../scrapers/glassdoor'
import { LinkedInApplicator } from '../apply/linkedin'
import { IndeedApplicator } from '../apply/indeed'
import { GlassdoorApplicator } from '../apply/glassdoor'
import { StorageService } from '../storage'

export type ServiceStatus = 'idle' | 'searching' | 'applying' | 'error'

export interface ServiceState {
  status: ServiceStatus
  jobs: JobPosting[]
  closedJobs: JobPosting[]
  showClosed: boolean
  lastSearch: Date | null
  nextSearch: Date | null
  config: Config
  configPath: string
}

export class JobSearchService extends EventEmitter {
  private state: ServiceState
  private searchTimer: NodeJS.Timeout | null = null
  private tickTimer: NodeJS.Timeout | null = null
  private verificationResolvers: Map<string, (code: string) => void> = new Map()

  constructor(
    config: Config,
    private resume: ResumeData,
    configPath: string,
    private storage: StorageService,
  ) {
    super()
    this.state = {
      status: 'idle',
      jobs: [],
      closedJobs: [],
      showClosed: false,
      lastSearch: null,
      nextSearch: null,
      config,
      configPath,
    }
  }

  start(): void {
    this.log('Paydirt service started')
    const stored = this.storage.loadActiveJobs()
    if (stored.length > 0) {
      this.state.jobs = stored
      this.log(`Loaded ${stored.length} job(s) from storage`)
      this.emit('jobs:found', stored)
    }
    const closed = this.storage.loadClosedJobs()
    if (closed.length > 0) {
      this.state.closedJobs = closed
    }
    this.scheduleSearch(0)
    this.tickTimer = setInterval(() => this.emit('tick', this.getState()), 1000)
  }

  stop(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.log('Service stopped')
  }

  getState(): ServiceState {
    return { ...this.state, jobs: [...this.state.jobs], closedJobs: [...this.state.closedJobs] }
  }

  toggleShowClosed(): void {
    this.state.showClosed = !this.state.showClosed
    this.emit('status:change', this.getState())
  }

  promptVerificationCode(source: string): Promise<string> {
    return new Promise((resolve) => {
      this.verificationResolvers.set(source, resolve)
      this.emit('verification:required', { source })
    })
  }

  resolveVerificationCode(source: string, code: string): void {
    const resolve = this.verificationResolvers.get(source)
    if (resolve) {
      this.verificationResolvers.delete(source)
      resolve(code)
    }
  }

  async runSearch(): Promise<void> {
    if (this.state.status === 'searching') {
      this.log('Search already in progress, skipping')
      return
    }

    this.setStatus('searching')
    this.log('Starting job search...')

    const options: SearchOptions = {
      keywords: this.state.config.search.keywords,
      location: this.state.config.search.location,
      remote: this.state.config.search.remote,
      salary_min: this.state.config.search.salary_min,
      experience_level: this.state.config.search.experience_level,
      exclude_companies: this.state.config.filters?.exclude_companies,
      exclude_keywords: this.state.config.filters?.exclude_keywords,
      max_pages: this.state.config.search.max_pages,
    }

    const found: JobPosting[] = []

    if (this.state.config.linkedin?.enabled) {
      try {
        const jobs = await new LinkedInScraper(this.state.config.linkedin).search(options, {
          log: (msg, level) => this.log(msg, level),
          promptCode: (source) => this.promptVerificationCode(source),
        })
        found.push(...jobs)
        this.log(`LinkedIn: ${jobs.length} posting(s) found`)
      } catch (err) {
        this.log(`LinkedIn search failed: ${err}`, 'error')
      }
    }

    if (this.state.config.indeed?.enabled) {
      try {
        const jobs = await new IndeedScraper(this.state.config.indeed).search(options, {
          log: (msg, level) => this.log(msg, level),
        })
        found.push(...jobs)
        this.log(`Indeed: ${jobs.length} posting(s) found`)
      } catch (err) {
        this.log(`Indeed search failed: ${err}`, 'error')
      }
    }

    if (this.state.config.glassdoor?.enabled) {
      try {
        const jobs = await new GlassdoorScraper(this.state.config.glassdoor).search(options, {
          log: (msg, level) => this.log(msg, level),
        })
        found.push(...jobs)
        this.log(`Glassdoor: ${jobs.length} posting(s) found`)
      } catch (err) {
        this.log(`Glassdoor search failed: ${err}`, 'error')
      }
    }

    const foundUrls = new Set(found.map((j) => j.url))
    const now = new Date()

    // Merge found jobs into in-memory list and persist
    let newCount = 0
    for (const job of found) {
      const existing = this.state.jobs.find((j) => j.url === job.url)
      if (existing) {
        existing.fetchedAt = now
        existing.isNew = true
        // preserve applied/skipped status
        if (!['applied', 'skipped', 'failed'].includes(existing.status)) {
          existing.status = job.status
        }
      } else {
        this.state.jobs.push(job)
        newCount++
      }
      this.storage.upsertJob({ ...job, fetchedAt: now })
    }

    if (newCount > 0) {
      this.log(`Found ${newCount} new posting(s). Use "apply all" or "apply <number>" to apply.`)
    } else if (found.length > 0) {
      this.log(`Search complete — ${found.length} posting(s) confirmed active`)
    } else {
      this.log('No postings found')
    }

    // Check previously-stored jobs that weren't returned in this search
    await this.checkStalledJobs(foundUrls, options)

    this.state.lastSearch = new Date()
    this.emit('jobs:found', this.state.jobs)
    this.setStatus('idle')
    this.scheduleSearch(this.state.config.search.interval * 60 * 1000)
  }

  private async checkStalledJobs(foundUrls: Set<string>, _options: SearchOptions): Promise<void> {
    const toCheck = this.state.jobs.filter(
      (j) => !foundUrls.has(j.url) && !['applied', 'skipped', 'closed'].includes(j.status),
    )
    if (toCheck.length === 0) return

    this.log(`Checking ${toCheck.length} previously-found job(s) still active...`)

    const bySource = new Map<string, JobPosting[]>()
    for (const job of toCheck) {
      const list = bySource.get(job.source) ?? []
      list.push(job)
      bySource.set(job.source, list)
    }

    const checkBatch = async (scraper: { checkJobsBatch(urls: string[], ctx?: object): Promise<Map<string, boolean>> }, jobs: JobPosting[]) => {
      try {
        const results = await scraper.checkJobsBatch(jobs.map((j) => j.url), {
          log: (msg: string, level?: string) => this.log(msg, level as 'info' | 'warn' | 'error'),
        })
        for (const [url, isOpen] of results) {
          if (!isOpen) {
            const job = this.state.jobs.find((j) => j.url === url)
            if (job) {
              job.status = 'closed'
              this.storage.markClosed(url)
              this.state.closedJobs.push(job)
              this.log(`Marked closed: ${job.title} at ${job.company}`)
            }
          }
        }
        this.state.jobs = this.state.jobs.filter((j) => j.status !== 'closed')
      } catch (err) {
        this.log(`Failed to check job status: ${err}`, 'warn')
      }
    }

    if (this.state.config.linkedin && bySource.has('linkedin')) {
      await checkBatch(new LinkedInScraper(this.state.config.linkedin), bySource.get('linkedin')!)
    }
    if (this.state.config.indeed && bySource.has('indeed')) {
      await checkBatch(new IndeedScraper(this.state.config.indeed), bySource.get('indeed')!)
    }
    if (this.state.config.glassdoor && bySource.has('glassdoor')) {
      await checkBatch(new GlassdoorScraper(this.state.config.glassdoor), bySource.get('glassdoor')!)
    }
  }

  async fetchJobDescription(jobId: string): Promise<void> {
    const job = this.state.jobs.find((j) => j.id === jobId)
    if (!job || job.description) return
    try {
      let description = ''
      if (job.source === 'linkedin' && this.state.config.linkedin) {
        description = await new LinkedInScraper(this.state.config.linkedin).fetchDescription(
          job.url,
          { log: (msg, level) => this.log(msg, level) },
        )
      } else if (job.source === 'indeed' && this.state.config.indeed) {
        description = await new IndeedScraper(this.state.config.indeed).fetchDescription(job.url)
      } else if (job.source === 'glassdoor' && this.state.config.glassdoor) {
        description = await new GlassdoorScraper(this.state.config.glassdoor).fetchDescription(
          job.url,
        )
      }
      job.description = description || ' '
      this.storage.updateDescription(job.id, job.description)
    } catch (err) {
      this.log(`Failed to fetch description for ${job.title}: ${err}`, 'error')
      job.description = ' '
    }
    this.emit('jobs:updated', this.state.jobs)
  }

  async applyToJob(jobId: string): Promise<void> {
    const job = this.state.jobs.find((j) => j.id === jobId)
    if (!job) {
      this.log(`Job ${jobId} not found`, 'error')
      return
    }

    this.setStatus('applying')
    this.log(`Applying to: ${job.title} at ${job.company} [${job.source}]`)

    try {
      let result
      switch (job.source) {
        case 'linkedin':
          if (!this.state.config.linkedin) throw new Error('LinkedIn not configured')
          result = await new LinkedInApplicator(this.state.config.linkedin).apply(
            job,
            this.resume,
            {
              log: (msg, level) => this.log(msg, level),
              promptCode: (source) => this.promptVerificationCode(source),
            },
          )
          break
        case 'indeed':
          if (!this.state.config.indeed) throw new Error('Indeed not configured')
          result = await new IndeedApplicator(this.state.config.indeed).apply(job, this.resume, {
            log: (msg, level) => this.log(msg, level),
          })
          break
        case 'glassdoor':
          if (!this.state.config.glassdoor) throw new Error('Glassdoor not configured')
          result = await new GlassdoorApplicator(this.state.config.glassdoor).apply(
            job,
            this.resume,
            { log: (msg, level) => this.log(msg, level) },
          )
          break
      }

      if (result.success) {
        job.status = 'applied'
        this.storage.updateStatus(job.id, 'applied')
        this.log(`Applied to ${job.title} at ${job.company}`)
      } else {
        job.status = 'failed'
        this.storage.updateStatus(job.id, 'failed')
        this.log(`Failed to apply to ${job.title}: ${result.message}`, 'error')
      }
    } catch (err) {
      job.status = 'failed'
      this.storage.updateStatus(job.id, 'failed')
      this.log(`Error applying to ${job.title}: ${err}`, 'error')
    }

    this.emit('jobs:updated', this.state.jobs)
    this.setStatus('idle')
  }

  async applyToJobs(jobIds: string[]): Promise<void> {
    for (const id of jobIds) {
      await this.applyToJob(id)
    }
  }

  skipJob(jobId: string): void {
    const job = this.state.jobs.find((j) => j.id === jobId)
    if (job) {
      job.status = 'skipped'
      this.storage.updateStatus(job.id, 'skipped')
      this.emit('jobs:updated', this.state.jobs)
    }
  }

  reloadConfig(): void {
    try {
      this.state.config = loadConfig(this.state.configPath)
      this.log('Configuration reloaded from disk')
      this.emit('config:updated', this.state.config)
      if (this.searchTimer) clearTimeout(this.searchTimer)
      this.scheduleSearch(this.state.config.search.interval * 60 * 1000)
    } catch (err) {
      this.log(`Failed to reload config: ${err}`, 'error')
    }
  }

  setConfig(keyPath: string, value: string): void {
    try {
      this.state.config = setConfigValue(this.state.config, keyPath, value)
      saveConfig(this.state.configPath, this.state.config)
      this.log(`Config updated: ${keyPath} = ${value}`)
      this.emit('config:updated', this.state.config)
    } catch (err) {
      this.log(`Invalid config: ${err}`, 'error')
    }
  }

  getConfig(keyPath: string): unknown {
    return getConfigValue(this.state.config, keyPath)
  }

  private scheduleSearch(delayMs: number): void {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.state.nextSearch = new Date(Date.now() + delayMs)
    this.emit('status:change', this.getState())
    this.searchTimer = setTimeout(() => this.runSearch(), delayMs)
  }

  private setStatus(status: ServiceStatus): void {
    this.state.status = status
    this.emit('status:change', this.getState())
  }

  private log(message: string, level: 'info' | 'error' | 'warn' = 'info'): void {
    this.emit('log', { message, level, timestamp: new Date() })
  }
}
