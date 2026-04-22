import { JobSearchService } from '../service';

export interface CommandResult {
  success: boolean;
  message?: string;
}

export function processCommand(raw: string, service: JobSearchService): CommandResult {
  const parts = raw.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case 'help':
      return {
        success: true,
        message: [
          'Commands:',
          '  search                   Trigger an immediate search',
          '  reload                   Reload config from disk',
          '  apply all                Apply to all new job postings',
          '  apply <n>                Apply to job #n',
          '  apply <n1,n2,...>        Apply to multiple jobs by number',
          '  skip <n|all>             Skip job(s)',
          '  jobs                     List all current postings',
          '  config set <key> <val>   Set config value (e.g. config set search.interval 30)',
          '  config get <key>         Get config value',
          '  config list              Show full config',
          '  clear                    Clear the activity log',
          '  exit / quit              Stop and exit',
        ].join('\n'),
      };

    case 'search':
      service.runSearch();
      return { success: true };

    case 'reload':
      service.reloadConfig();
      return { success: true };

    case 'apply': {
      const state = service.getState();
      const newJobs = state.jobs.filter(j => j.status === 'new');

      if (!args[0]) {
        return { success: false, message: 'Usage: apply all | apply <number> | apply <n1,n2,...>' };
      }

      if (args[0] === 'all') {
        if (newJobs.length === 0) return { success: false, message: 'No new jobs to apply to' };
        service.applyToJobs(newJobs.map(j => j.id));
        return { success: true, message: `Applying to ${newJobs.length} job(s)...` };
      }

      const indices = args[0].split(',').map(n => parseInt(n.trim(), 10) - 1).filter(n => !isNaN(n));
      const ids = indices.map(i => state.jobs[i]?.id).filter((id): id is string => !!id);
      if (ids.length === 0) return { success: false, message: 'No valid job numbers specified' };
      service.applyToJobs(ids);
      return { success: true, message: `Applying to ${ids.length} job(s)...` };
    }

    case 'skip': {
      const state = service.getState();
      if (!args[0]) return { success: false, message: 'Usage: skip <number> | skip all' };
      if (args[0] === 'all') {
        state.jobs.filter(j => j.status === 'new').forEach(j => service.skipJob(j.id));
        return { success: true, message: 'All new jobs skipped' };
      }
      const idx = parseInt(args[0], 10) - 1;
      const job = state.jobs[idx];
      if (!job) return { success: false, message: `No job at position ${args[0]}` };
      service.skipJob(job.id);
      return { success: true, message: `Skipped: ${job.title} at ${job.company}` };
    }

    case 'jobs': {
      const state = service.getState();
      if (state.jobs.length === 0) return { success: true, message: 'No jobs found yet' };
      const lines = state.jobs.map((j, i) =>
        `${String(i + 1).padStart(3)}. [${j.source.slice(0, 2).toUpperCase()}] ${j.title} @ ${j.company} — ${j.status}`
      );
      return { success: true, message: lines.join('\n') };
    }

    case 'config': {
      const sub = args[0]?.toLowerCase();
      if (sub === 'set') {
        if (args.length < 3) return { success: false, message: 'Usage: config set <key> <value>' };
        service.setConfig(args[1], args.slice(2).join(' '));
        return { success: true };
      }
      if (sub === 'get') {
        if (!args[1]) return { success: false, message: 'Usage: config get <key>' };
        const val = service.getConfig(args[1]);
        return { success: true, message: `${args[1]} = ${JSON.stringify(val)}` };
      }
      if (sub === 'list') {
        return { success: true, message: JSON.stringify(service.getState().config, null, 2) };
      }
      return { success: false, message: 'Usage: config set|get|list ...' };
    }

    case 'clear':
      return { success: true, message: '__CLEAR__' };

    case 'exit':
    case 'quit':
    case 'q':
      return { success: true, message: '__EXIT__' };

    case '':
      return { success: true };

    default:
      return { success: false, message: `Unknown command: "${cmd}". Type "help" for a list of commands.` };
  }
}
