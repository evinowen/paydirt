import path from 'path';
import { loadConfig } from './config/loader';
import { ConfigWatcher } from './config/watcher';
import { parseResume } from './resume/parser';
import { JobSearchService } from './service';
import { TUI } from './tui';

async function main(): Promise<void> {
  const configPath = process.argv[2] ?? 'config.yaml';
  const absoluteConfigPath = path.resolve(configPath);

  let config;
  try {
    config = loadConfig(absoluteConfigPath);
  } catch (err) {
    console.error(`Failed to load config: ${err}`);
    console.error('Usage: npm start [config.yaml]');
    console.error('Copy config.example.yaml to config.yaml and fill in your details.');
    process.exit(1);
  }

  let resume;
  try {
    resume = await parseResume(config.resume.path);
  } catch (err) {
    console.error(`Failed to parse resume: ${err}`);
    process.exit(1);
  }

  const service = new JobSearchService(config, resume, absoluteConfigPath);
  const tui = new TUI(service);

  const watcher = new ConfigWatcher();
  watcher.watch(absoluteConfigPath);
  watcher.on('change', () => {
    service.emit('log', {
      message: 'Config file changed on disk — type "reload" to apply, or it will be applied on next start',
      level: 'warn',
      timestamp: new Date(),
    });
  });

  const shutdown = () => {
    service.stop();
    watcher.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  tui.start();
  service.start();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
