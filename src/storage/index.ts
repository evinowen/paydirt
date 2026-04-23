import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { JobPosting, JobSource, JobStatus } from '../scrapers/types'

const DB_PATH = path.resolve('data', 'jobs.db')

interface JobRow {
  id: string
  title: string
  company: string
  location: string
  url: string
  source: string
  status: string
  easy_apply: number
  description: string
  salary: string | null
  posted_at: string | null
  found_at: string
  fetched_at: string
}

function rowToJob(row: JobRow): JobPosting {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    url: row.url,
    source: row.source as JobSource,
    status: row.status as JobStatus,
    easyApply: row.easy_apply === 1,
    description: row.description,
    salary: row.salary ?? undefined,
    postedAt: row.posted_at ?? undefined,
    foundAt: new Date(row.found_at),
    fetchedAt: new Date(row.fetched_at),
    isNew: false,
  }
}

export class StorageService {
  private db: Database.Database

  constructor(dbPath = DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        location TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        easy_apply INTEGER NOT NULL DEFAULT 0,
        description TEXT NOT NULL DEFAULT '',
        salary TEXT,
        posted_at TEXT,
        found_at TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      )
    `)
  }

  loadActiveJobs(): JobPosting[] {
    return (this.db.prepare("SELECT * FROM jobs WHERE status != 'closed' ORDER BY found_at DESC").all() as JobRow[]).map(rowToJob)
  }

  loadClosedJobs(): JobPosting[] {
    return (this.db.prepare("SELECT * FROM jobs WHERE status = 'closed' ORDER BY fetched_at DESC").all() as JobRow[]).map(rowToJob)
  }

  getByUrl(url: string): JobPosting | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE url = ?').get(url) as JobRow | undefined
    return row ? rowToJob(row) : null
  }

  upsertJob(job: JobPosting): void {
    this.db.prepare(`
      INSERT INTO jobs (id, title, company, location, url, source, status, easy_apply, description, salary, posted_at, found_at, fetched_at)
      VALUES (@id, @title, @company, @location, @url, @source, @status, @easy_apply, @description, @salary, @posted_at, @found_at, @fetched_at)
      ON CONFLICT(url) DO UPDATE SET
        title       = excluded.title,
        company     = excluded.company,
        location    = excluded.location,
        easy_apply  = excluded.easy_apply,
        salary      = COALESCE(salary, excluded.salary),
        posted_at   = COALESCE(posted_at, excluded.posted_at),
        description = CASE WHEN length(description) > 1 THEN description ELSE excluded.description END,
        status      = CASE WHEN status IN ('applied', 'skipped', 'closed', 'failed') THEN status ELSE excluded.status END,
        fetched_at  = excluded.fetched_at
    `).run({
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      source: job.source,
      status: job.status,
      easy_apply: job.easyApply ? 1 : 0,
      description: job.description,
      salary: job.salary ?? null,
      posted_at: job.postedAt ?? null,
      found_at: job.foundAt.toISOString(),
      fetched_at: job.fetchedAt.toISOString(),
    })
  }

  markClosed(url: string): void {
    this.db.prepare("UPDATE jobs SET status = 'closed' WHERE url = ?").run(url)
  }

  updateDescription(id: string, description: string): void {
    this.db.prepare('UPDATE jobs SET description = ? WHERE id = ?').run(description, id)
  }

  updateStatus(id: string, status: JobStatus): void {
    this.db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, id)
  }

  close(): void {
    this.db.close()
  }
}
