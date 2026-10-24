import { appendFile } from 'node:fs/promises'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { scrubSecrets } from '@shared/errors'

export interface LogSink {
  write(line: string): void
}

/**
 * Appends launcher-level diagnostics to a rotating file. Game output has its
 * own per-instance log; this file records installs, auth and launcher errors.
 */
export class FileLogger implements LogSink {
  private constructor(private readonly file: string) {}

  static async open(file: string): Promise<FileLogger> {
    await mkdir(dirname(file), { recursive: true })
    return new FileLogger(file)
  }

  write(line: string): void {
    const text = `${new Date().toISOString()} ${scrubSecrets(line)}\n`
    void appendFile(this.file, text, 'utf8').catch(() => undefined)
  }

  get path(): string {
    return this.file
  }
}

/** Console sink used when no log file is configured (tests, CLI helpers). */
export const consoleSink: LogSink = {
  write(line: string) {
    process.stderr.write(`${scrubSecrets(line)}\n`)
  }
}
