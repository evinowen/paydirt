import fs from 'fs'
import path from 'path'

export class FileLogger {
  private stream: fs.WriteStream | null = null
  private currentDate = ''

  constructor(private dir: string) {}

  init(): void {
    fs.mkdirSync(this.dir, { recursive: true })
    this.purgeOldLogs()
    this.openStream()
  }

  write(message: string, level = 'info'): void {
    this.openStream()
    const timestamp = new Date().toISOString()
    this.stream?.write(`${timestamp} [${level.toUpperCase().padEnd(5)}] ${message}\n`)
  }

  close(): void {
    this.stream?.end()
    this.stream = null
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10)
  }

  private openStream(): void {
    const date = this.today()
    if (date === this.currentDate && this.stream) return
    this.stream?.end()
    this.currentDate = date
    this.stream = fs.createWriteStream(path.join(this.dir, `${date}.log`), { flags: 'a' })
  }

  private purgeOldLogs(): void {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    for (const file of fs.readdirSync(this.dir)) {
      if (!/^\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue
      if (new Date(file.slice(0, 10)).getTime() < cutoff) {
        fs.unlinkSync(path.join(this.dir, file))
      }
    }
  }
}
