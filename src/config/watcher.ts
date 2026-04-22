import chokidar from 'chokidar'
import { EventEmitter } from 'events'

export class ConfigWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null

  watch(configPath: string): void {
    this.watcher = chokidar.watch(configPath, { persistent: true, ignoreInitial: true })
    this.watcher.on('change', () => this.emit('change'))
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
  }
}
