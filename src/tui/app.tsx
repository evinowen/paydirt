import React, { useState, useEffect, useCallback } from 'react'
import { render, Box, Text, useInput, useApp } from 'ink'
import TextInput from 'ink-text-input'
import { JobSearchService, ServiceState } from '../service'
import { JobPosting } from '../scrapers/types'
import { processCommand } from './commands'

interface LogEntry {
  id: number
  text: string
  level: 'info' | 'error' | 'warn' | 'command'
  time: string
}

const SOURCE_LABEL: Record<string, string> = { linkedin: 'LI', indeed: 'IN', glassdoor: 'GD' }
const STATUS_COLOR: Record<string, string> = {
  idle: 'green',
  searching: 'yellow',
  applying: 'cyan',
  error: 'red',
}
const JOB_STATUS_COLOR: Record<string, string> = {
  new: 'cyan',
  applied: 'green',
  skipped: 'grey',
  failed: 'red',
  closed: 'grey',
}

function fmtRelativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
const MAX_LOGS = 500

let logIdCounter = 0

function nowTime() {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

function fmtCountdown(ms: number) {
  if (ms <= 0) return '00:00'
  const secs = Math.floor(ms / 1000)
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
}

const Header: React.FC<{ state: ServiceState }> = ({ state }) => {
  const col = STATUS_COLOR[state.status] ?? 'white'
  const countdown = state.nextSearch
    ? fmtCountdown(state.nextSearch.getTime() - Date.now())
    : '--:--'
  const newCount = state.jobs.filter((j) => j.status === 'new').length
  const closedSuffix = state.showClosed ? `  |  ${state.closedJobs.length} closed` : ''
  const label = `  PAYDIRT  |  Status: ${state.status.toUpperCase()}  |  Next: ${countdown}  |  ${newCount} new / ${state.jobs.length} total${closedSuffix}`
  return (
    <Box paddingX={1}>
      <Text backgroundColor={state.showClosed ? 'grey' : 'blue'} color="white" bold>
        {label}
      </Text>
    </Box>
  )
}

const LogLine: React.FC<{ entry: LogEntry }> = ({ entry }) => {
  const col =
    entry.level === 'error'
      ? 'red'
      : entry.level === 'warn'
        ? 'yellow'
        : entry.level === 'command'
          ? 'magenta'
          : 'white'
  return (
    <Text>
      <Text color="grey">[{entry.time}] </Text>
      <Text color={col}>{entry.text}</Text>
    </Text>
  )
}

const JobLine: React.FC<{ job: JobPosting; index: number; selected: boolean }> = ({
  job,
  index,
  selected,
}) => {
  const src = SOURCE_LABEL[job.source] ?? '??'
  const col = JOB_STATUS_COLOR[job.status] ?? 'white'
  const bg = selected ? 'green' : undefined
  const fg = (c: string) => selected ? 'black' : c
  const timeLabel = job.isNew ? '' : `  ${fmtRelativeTime(job.foundAt)}`
  const statusLine = ` ${String(index + 1).padStart(3)}. [${src}]  ${job.status.toUpperCase()}${timeLabel}`
  const titleLine = `  ${job.title.replace(/\s+/g, ' ').trim()} @ ${job.company}${job.easyApply ? ' [EA]' : ''}`
  return (
    <Box flexDirection="column">
      <Text backgroundColor={bg} color={fg(job.isNew ? 'yellow' : 'grey')} bold={selected} wrap="truncate">
        {statusLine}
      </Text>
      <Text backgroundColor={bg} color={fg(col)} bold={selected} wrap="truncate">
        {titleLine}
      </Text>
    </Box>
  )
}

const DOTS = ['·', '··', '···']

const JobExpanded: React.FC<{ job: JobPosting; rows: number; loading: boolean; onClose: () => void }> = ({
  job,
  rows,
  loading,
  onClose,
}) => {
  const [dotIdx, setDotIdx] = useState(0)
  const [scroll, setScroll] = useState(0)

  useEffect(() => { setScroll(0) }, [job.id])

  useEffect(() => {
    if (!loading) return
    const t = setInterval(() => setDotIdx((i) => (i + 1) % DOTS.length), 400)
    return () => clearInterval(t)
  }, [loading])

  const col = JOB_STATUS_COLOR[job.status] ?? 'white'
  const cols = process.stdout.columns ?? 80
  const rawTitle = job.title.replace(/\s+/g, ' ').trim()
  const displayTitle = rawTitle.length > cols - 6 ? rawTitle.slice(0, cols - 7) + '…' : rawTitle
  const descHeight = Math.max(1, rows - 11)
  const hasContent = job.description.trim().length > 0
  const descLines = hasContent ? job.description.split('\n') : []
  const maxScroll = Math.max(0, descLines.length - descHeight)
  const clamped = Math.min(scroll, maxScroll)
  const visible = descLines.slice(clamped, clamped + descHeight)

  useInput((_input, key) => {
    if (key.escape || key.backspace) { onClose() }
    if (key.upArrow) setScroll((prev) => Math.max(0, prev - 1))
    if (key.downArrow) setScroll((prev) => Math.min(maxScroll, prev + 1))
  })

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="yellow" flexDirection="column" paddingX={1}>
        <Text bold>{displayTitle}</Text>
        <Text>
          {'Company: '}
          <Text bold>{job.company}</Text>
          {'  Location: '}
          {job.location}
          {job.salary ? `  Salary: ${job.salary}` : ''}
        </Text>
        <Text>
          {'Source: '}
          {job.source}
          {'  Status: '}
          <Text color={col}>{job.status}</Text>
          {job.easyApply ? (
            <>
              {'  '}
              <Text color="green">[Easy Apply]</Text>
            </>
          ) : null}
          {job.postedAt ? `  Posted: ${job.postedAt}` : ''}
        </Text>
      </Box>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="white"
        paddingX={1}
        height={descHeight + 3}
      >
        {loading ? (
          <Text color="grey">{'Fetching' + DOTS[dotIdx]}</Text>
        ) : !hasContent ? (
          <Text color="grey">No description available.</Text>
        ) : (
          visible.map((line, i) => (
            <Text key={i}>{line || ' '}</Text>
          ))
        )}
      </Box>
      <Box>
        <Text color="grey">
          {loading || !hasContent
            ? ' ESC back'
            : ` ↑↓ scroll  ESC back  (lines ${clamped + 1}–${Math.min(clamped + descHeight, descLines.length)} of ${descLines.length})`}
        </Text>
      </Box>
    </Box>
  )
}

const JobDetail: React.FC<{ job?: JobPosting }> = ({ job }) => {
  if (!job) {
    return (
      <Box borderStyle="single" borderColor="yellow" paddingX={1}>
        <Text color="grey">Use arrow keys to select a job (when command line is empty)</Text>
      </Box>
    )
  }
  const col = JOB_STATUS_COLOR[job.status] ?? 'white'
  return (
    <Box borderStyle="single" borderColor="yellow" flexDirection="column" paddingX={1}>
      <Text bold wrap="truncate">{job.title.replace(/\s+/g, ' ').trim()}</Text>
      <Text>
        {'Company: '}
        <Text bold>{job.company}</Text>
        {'  Location: '}
        {job.location}
        {job.salary ? `  Salary: ${job.salary}` : ''}
      </Text>
      <Text>
        {'Source: '}
        {job.source}
        {'  Status: '}
        <Text color={col}>{job.status}</Text>
        {job.easyApply ? (
          <>
            {'  '}
            <Text color="green">[Easy Apply]</Text>
          </>
        ) : null}
      </Text>
    </Box>
  )
}

const App: React.FC<{ service: JobSearchService }> = ({ service }) => {
  const { exit } = useApp()
  const [state, setState] = useState<ServiceState>(service.getState())
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: logIdCounter++,
      text: 'Welcome to Paydirt. Type "help" for available commands.',
      level: 'info',
      time: nowTime(),
    },
  ])
  const [command, setCommand] = useState('')
  const [selectedJob, setSelectedJob] = useState(0)
  const [expandedJob, setExpandedJob] = useState(false)
  const [descLoading, setDescLoading] = useState(false)
  const [pendingVerification, setPendingVerification] = useState<string | null>(null)

  const addLog = useCallback((text: string, level: LogEntry['level'] = 'info') => {
    setLogs((prev) => [
      ...prev.slice(-(MAX_LOGS - 1)),
      { id: logIdCounter++, text, level, time: nowTime() },
    ])
  }, [])

  useEffect(() => {
    const onLog = ({ message, level }: { message: string; level: string }) =>
      addLog(message, level as LogEntry['level'])
    const onUpdate = () => setState({ ...service.getState() })
    const onJobsUpdated = () => { setState({ ...service.getState() }); setDescLoading(false) }
    const onVerify = ({ source }: { source: string }) => {
      addLog(`LinkedIn sent a verification code to your email — enter it below`, 'warn')
      setPendingVerification(source)
      setCommand('')
    }
    service.on('log', onLog)
    service.on('jobs:found', onJobsUpdated)
    service.on('jobs:updated', onJobsUpdated)
    service.on('status:change', onUpdate)
    service.on('tick', onUpdate)
    service.on('verification:required', onVerify)
    return () => {
      service.off('log', onLog)
      service.off('jobs:found', onJobsUpdated)
      service.off('jobs:updated', onJobsUpdated)
      service.off('status:change', onUpdate)
      service.off('tick', onUpdate)
      service.off('verification:required', onVerify)
    }
  }, [service, addLog])

  const visibleJobs = state.showClosed ? state.closedJobs : state.jobs

  useInput((_input: string, key: { upArrow: boolean; downArrow: boolean; return: boolean }) => {
    if (command !== '' || expandedJob) return
    if (key.return && visibleJobs[selectedJob]) {
      const job = visibleJobs[selectedJob]
      setExpandedJob(true)
      if (!job.description) {
        setDescLoading(true)
        service.fetchJobDescription(job.id)
      }
    }
    if (key.upArrow) setSelectedJob((prev) => Math.max(0, prev - 1))
    if (key.downArrow)
      setSelectedJob((prev) => Math.min(Math.max(0, visibleJobs.length - 1), prev + 1))
  })

  const handleSubmit = useCallback(
    (value: string) => {
      setCommand('')
      const trimmed = value.trim()

      if (pendingVerification) {
        if (!trimmed) return
        addLog(`[verification code submitted]`, 'command')
        setPendingVerification(null)
        service.resolveVerificationCode(pendingVerification, trimmed)
        return
      }

      if (!trimmed) return
      addLog(`> ${trimmed}`, 'command')
      const result = processCommand(trimmed, service)
      if (result.message === '__EXIT__') {
        service.stop()
        exit()
        return
      }
      if (result.message === '__CLEAR__') {
        setLogs([])
        return
      }
      if (result.message) {
        for (const line of result.message.split('\n')) {
          addLog(line, result.success ? 'info' : 'error')
        }
      }
    },
    [service, exit, addLog, pendingVerification],
  )

  const rows = process.stdout.rows ?? 24
  const mainHeight = Math.max(8, rows - 7)
  const jobsHeight = Math.floor(mainHeight / 2)
  const recentLogs = logs.slice(-mainHeight)

  if (expandedJob && visibleJobs[selectedJob]) {
    return (
      <Box flexDirection="column">
        <Header state={state} />
        <JobExpanded job={visibleJobs[selectedJob]} rows={rows} loading={descLoading} onClose={() => { setExpandedJob(false); setDescLoading(false) }} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Header state={state} />

      <Box>
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" width="60%" height={mainHeight}>
          <Text bold color="cyan">
            {' Activity Log '}
          </Text>
          {recentLogs.map((e) => (
            <LogLine key={e.id} entry={e} />
          ))}
        </Box>

        <Box flexDirection="column" width="40%">
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={state.showClosed ? 'grey' : 'green'}
            height={jobsHeight}
          >
            <Text bold color={state.showClosed ? 'grey' : 'green'}>
              {state.showClosed ? ' Closed Postings ' : ' Job Postings '}
            </Text>
            {visibleJobs.length === 0 ? (
              <Text color="grey">{'  No jobs found yet'}</Text>
            ) : (
              visibleJobs.slice(0, Math.floor((jobsHeight - 2) / 2)).map((job, i) => (
                <JobLine key={job.id} job={job} index={i} selected={i === selectedJob} />
              ))
            )}
          </Box>

          <JobDetail job={visibleJobs[selectedJob]} />
        </Box>
      </Box>

      <Box>
        <Text color="grey" wrap="truncate">
          {visibleJobs[selectedJob]?.url
            ? `\x1b]8;;${visibleJobs[selectedJob].url}\x1b\\↗\x1b]8;;\x1b\\ ${visibleJobs[selectedJob].url}`
            : ''}
        </Text>
      </Box>

      <Box>
        <Text color="grey">
          {' Last search: '}
          {state.lastSearch?.toLocaleTimeString() ?? 'never'}
        </Text>
      </Box>

      <Box borderStyle="single" borderColor={pendingVerification ? 'yellow' : 'magenta'}>
        <Text color={pendingVerification ? 'yellow' : 'magenta'} bold>
          {pendingVerification ? ` [${pendingVerification} verify] ` : ' > '}
        </Text>
        <TextInput value={command} onChange={setCommand} onSubmit={handleSubmit} />
      </Box>
    </Box>
  )
}

export class TUI {
  constructor(private service: JobSearchService) {}

  async start(): Promise<void> {
    const { waitUntilExit, clear } = render(<App service={this.service} />)
    await waitUntilExit()
    clear()
    console.clear()
  }
}
