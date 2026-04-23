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
  const label = `  PAYDIRT  |  Status: ${state.status.toUpperCase()}  |  Next: ${countdown}  |  ${newCount} new / ${state.jobs.length} total`
  return (
    <Box paddingX={1}>
      <Text backgroundColor="blue" color="white" bold>
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
  return (
    <Box>
      <Text
        backgroundColor={selected ? 'green' : undefined}
        color={selected ? 'black' : col}
        bold={selected}
      >
        {` ${String(index + 1).padStart(3)}. [${src}] ${job.title} @ ${job.company}${job.easyApply ? ' [EA]' : ''}`}
      </Text>
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
      <Text bold>{job.title}</Text>
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
      <Text color="grey">
        {job.url}
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
    const onVerify = ({ source }: { source: string }) => {
      addLog(`LinkedIn sent a verification code to your email — enter it below`, 'warn')
      setPendingVerification(source)
      setCommand('')
    }
    service.on('log', onLog)
    service.on('jobs:found', onUpdate)
    service.on('jobs:updated', onUpdate)
    service.on('status:change', onUpdate)
    service.on('tick', onUpdate)
    service.on('verification:required', onVerify)
    return () => {
      service.off('log', onLog)
      service.off('jobs:found', onUpdate)
      service.off('jobs:updated', onUpdate)
      service.off('status:change', onUpdate)
      service.off('tick', onUpdate)
      service.off('verification:required', onVerify)
    }
  }, [service, addLog])

  // Arrow keys navigate the job list only when the command input is empty
  useInput((_input: string, key: { upArrow: boolean; downArrow: boolean }) => {
    if (command !== '') return
    if (key.upArrow) setSelectedJob((prev) => Math.max(0, prev - 1))
    if (key.downArrow)
      setSelectedJob((prev) => Math.min(Math.max(0, state.jobs.length - 1), prev + 1))
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
            borderColor="green"
            height={jobsHeight}
          >
            <Text bold color="green">
              {' Job Postings '}
            </Text>
            {state.jobs.length === 0 ? (
              <Text color="grey">{'  No jobs found yet'}</Text>
            ) : (
              state.jobs.slice(0, jobsHeight - 2).map((job, i) => (
                <JobLine key={job.id} job={job} index={i} selected={i === selectedJob} />
              ))
            )}
          </Box>

          <JobDetail job={state.jobs[selectedJob]} />
        </Box>
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
    await render(<App service={this.service} />).waitUntilExit()
  }
}
