export type PromptCodeFn = (source: string) => Promise<string>
export type LogFn = (message: string, level?: 'info' | 'warn' | 'error') => void

export interface AutomationContext {
  log?: LogFn
  promptCode?: PromptCodeFn
}

export type JobSource = 'linkedin' | 'indeed' | 'glassdoor'
export type JobStatus = 'new' | 'applied' | 'skipped' | 'failed'

export interface JobPosting {
  id: string
  title: string
  company: string
  location: string
  salary?: string
  description: string
  url: string
  source: JobSource
  postedAt?: string
  foundAt: Date
  status: JobStatus
  easyApply: boolean
}

export interface SearchOptions {
  keywords: string[]
  location: string
  remote?: boolean
  salary_min?: number
  experience_level?: string
  exclude_companies?: string[]
  exclude_keywords?: string[]
}
