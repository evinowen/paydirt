import blessed from 'blessed'
import { JobSearchService, ServiceState } from '../service'
import { JobPosting } from '../scrapers/types'
import { processCommand } from './commands'

const SOURCE_LABEL: Record<string, string> = { linkedin: 'LI', indeed: 'IN', glassdoor: 'GD' }
const STATUS_COLOR: Record<string, string> = {
  new: '{cyan-fg}',
  applied: '{green-fg}',
  skipped: '{grey-fg}',
  failed: '{red-fg}',
}

export class TUI {
  private screen: blessed.Widgets.Screen
  private header: blessed.Widgets.BoxElement
  private logPanel: blessed.Widgets.Log
  private jobsPanel: blessed.Widgets.ListElement
  private detailPanel: blessed.Widgets.BoxElement
  private statusBar: blessed.Widgets.BoxElement
  private commandInput: blessed.Widgets.TextboxElement

  constructor(private service: JobSearchService) {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Paydirt',
      fullUnicode: true,
      dockBorders: true,
    })

    this.header = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: ' {bold}PAYDIRT{/bold}',
      tags: true,
      style: { bg: 'blue', fg: 'white', bold: true },
    })

    this.logPanel = blessed.log({
      parent: this.screen,
      top: 1,
      left: 0,
      width: '60%',
      height: '100%-5',
      label: ' {bold}Activity Log{/bold} ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { ch: ' ', style: { bg: 'cyan' } },
    }) as blessed.Widgets.Log

    this.jobsPanel = blessed.list({
      parent: this.screen,
      top: 1,
      right: 0,
      width: '40%',
      height: '50%-2',
      label: ' {bold}Job Postings{/bold} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        selected: { bg: 'green', fg: 'black', bold: true },
        item: { fg: 'white' },
      },
      keys: true,
      vi: true,
      mouse: true,
      scrollable: true,
      scrollbar: { ch: ' ', style: { bg: 'green' } },
    })

    this.detailPanel = blessed.box({
      parent: this.screen,
      bottom: 3,
      right: 0,
      width: '40%',
      height: '50%-2',
      label: ' {bold}Job Detail{/bold} ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
      scrollable: true,
      scrollbar: { ch: ' ', style: { bg: 'yellow' } },
      content: '{grey-fg}Select a job to view details{/grey-fg}',
    })

    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 2,
      left: 0,
      width: '60%',
      height: 1,
      tags: true,
      style: { bg: 'black', fg: 'grey' },
    })

    this.commandInput = blessed.textbox({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 2,
      label: ' {bold}Command{/bold} — type "help" for commands ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'magenta' }, fg: 'white' },
      inputOnFocus: true,
      keys: true,
      mouse: true,
    })

    this.wireEvents()
  }

  private wireEvents(): void {
    this.screen.key(['C-c'], () => {
      this.service.stop()
      process.exit(0)
    })

    this.commandInput.key('enter', () => {
      const value = (this.commandInput.getValue() as string).trim()
      this.commandInput.clearValue()
      this.screen.render()
      if (!value) return

      this.logLine(`{magenta-fg}> ${value}{/}`)
      const result = processCommand(value, this.service)

      if (result.message === '__EXIT__') {
        this.service.stop()
        process.exit(0)
      }

      if (result.message === '__CLEAR__') {
        ;(this.logPanel as unknown as { setContent: (s: string) => void }).setContent('')
        this.screen.render()
        return
      }

      if (result.message) {
        const color = result.success ? '{white-fg}' : '{red-fg}'
        for (const line of result.message.split('\n')) {
          this.logLine(`${color}${line}{/}`)
        }
      }

      this.screen.render()
    })

    this.jobsPanel.on('select', (_item: unknown, index: number) => {
      const state = this.service.getState()
      const job = state.jobs[index]
      if (job) this.renderDetail(job)
    })

    this.service.on('log', ({ message, level }: { message: string; level: string }) => {
      const color = level === 'error' ? '{red-fg}' : level === 'warn' ? '{yellow-fg}' : '{white-fg}'
      const ts = new Date().toLocaleTimeString('en-US', { hour12: false })
      this.logLine(`{grey-fg}[${ts}]{/} ${color}${message}{/}`)
      this.screen.render()
    })

    this.service.on('jobs:found', () => {
      this.refreshJobs()
      this.screen.render()
    })
    this.service.on('jobs:updated', () => {
      this.refreshJobs()
      this.screen.render()
    })
    this.service.on('status:change', (state: ServiceState) => {
      this.renderHeader(state)
      this.screen.render()
    })
    this.service.on('tick', (state: ServiceState) => {
      this.renderHeader(state)
      this.renderStatusBar(state)
      this.screen.render()
    })

    this.commandInput.focus()
  }

  private logLine(line: string): void {
    ;(this.logPanel as unknown as { log: (s: string) => void }).log(line)
  }

  private renderHeader(state: ServiceState): void {
    const colors: Record<string, string> = {
      idle: '{green-fg}',
      searching: '{yellow-fg}',
      applying: '{cyan-fg}',
      error: '{red-fg}',
    }
    const col = colors[state.status] ?? '{white-fg}'
    const countdown = state.nextSearch
      ? fmtCountdown(state.nextSearch.getTime() - Date.now())
      : '--:--'
    const newCount = state.jobs.filter((j) => j.status === 'new').length
    this.header.setContent(
      ` {bold}PAYDIRT{/bold}  |  Status: ${col}${state.status.toUpperCase()}{/}` +
        `  |  Next search: ${countdown}  |  {cyan-fg}${newCount} new{/} / ${state.jobs.length} total`,
    )
  }

  private renderStatusBar(state: ServiceState): void {
    const last = state.lastSearch
      ? `Last search: ${state.lastSearch.toLocaleTimeString()}`
      : 'No search run yet'
    this.statusBar.setContent(` ${last}`)
  }

  private refreshJobs(): void {
    const jobs = this.service.getState().jobs
    const items = jobs.map((job, i) => {
      const src = SOURCE_LABEL[job.source] ?? '??'
      const col = STATUS_COLOR[job.status] ?? '{white-fg}'
      const ea = job.easyApply ? ' {green-fg}[EA]{/}' : ''
      return `${String(i + 1).padStart(3)}. ${col}[${src}]{/} ${job.title} @ {bold}${job.company}{/bold}${ea}`
    })
    this.jobsPanel.setItems(items as unknown as string[])
  }

  private renderDetail(job: JobPosting): void {
    const col = STATUS_COLOR[job.status] ?? '{white-fg}'
    const lines = [
      `{bold}${job.title}{/bold}`,
      `Company:  {bold}${job.company}{/bold}`,
      `Location: ${job.location}`,
      job.salary ? `Salary:   ${job.salary}` : null,
      `Source:   ${job.source}`,
      `Status:   ${col}${job.status}{/}`,
      job.easyApply ? `{green-fg}✓ Easy Apply{/}` : null,
      ``,
      `URL: ${job.url}`,
      job.description ? `\n${job.description}` : null,
    ].filter((l): l is string => l !== null)

    this.detailPanel.setContent(lines.join('\n'))
    this.screen.render()
  }

  start(): void {
    this.commandInput.focus()
    this.screen.render()
    this.logLine('{blue-fg}Welcome to Paydirt. Type "help" for available commands.{/}')
    this.screen.render()
  }
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00'
  const secs = Math.floor(ms / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
