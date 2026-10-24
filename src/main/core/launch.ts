import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MinecraftFolder, Version, createMinecraftProcessWatcher, launch } from '@xmcl/core'
import { KakeraError, scrubSecrets, toAppError } from '@shared/errors'
import type { AppError, LaunchPhase, LaunchStatus, LogLine } from '@shared/types'
import { gamePaths } from './paths'
import type { InstanceRecord } from './instances/store'
import type { LogSink } from './log'
import type { JavaService } from './minecraft/java'

const LOG_LIMIT = 5_000

export interface LaunchAccount {
  type: 'microsoft' | 'offline'
  name: string
  uuid: string
  accessToken: string
}

export interface LaunchRequest {
  instance: InstanceRecord
  account: LaunchAccount
  memoryMb: number
  jvmArgs: string[]
}

export interface LaunchServiceOptions {
  gameRoot: string
  java: JavaService
  log: LogSink
}

/**
 * Owns at most one running game process, mirrors its output into a bounded
 * ring buffer plus a log file, and exposes a truthful phase machine
 * (preparing -> starting -> running -> exited/crashed).
 */
export class LaunchService {
  private readonly paths
  private readonly stateListeners = new Set<(status: LaunchStatus) => void>()
  private readonly logListeners = new Set<(line: LogLine) => void>()
  private readonly buffers = new Map<string, LogLine[]>()
  private status: LaunchStatus = { phase: 'idle', instanceId: null, startedAt: null, exitCode: null, error: null }
  private process: ChildProcess | null = null
  private seq = 0
  private logFile: string | null = null

  constructor(private readonly options: LaunchServiceOptions) {
    this.paths = gamePaths(options.gameRoot)
  }

  getStatus(): LaunchStatus {
    return this.status
  }

  getLog(id: string, limit = 400): LogLine[] {
    const buffer = this.buffers.get(id) ?? []
    return buffer.slice(Math.max(0, buffer.length - limit))
  }

  logFilePath(instanceId: string): string | null {
    return this.status.instanceId === instanceId ? this.logFile : null
  }

  onState(listener: (status: LaunchStatus) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  onLog(listener: (line: LogLine) => void): () => void {
    this.logListeners.add(listener)
    return () => this.logListeners.delete(listener)
  }

  async start(request: LaunchRequest): Promise<void> {
    if (this.status.phase === 'preparing' || this.status.phase === 'starting' || this.status.phase === 'running') {
      throw new KakeraError('launch.already-running', 'A game process is already running')
    }
    const { instance, account } = request
    if (!instance.resolvedVersionId) {
      throw new KakeraError('launch.instance-not-installed', 'This instance is not installed yet')
    }

    this.seq = 0
    this.buffers.set(instance.id, [])
    const instanceLogDir = this.paths.instanceLogs(instance.id)
    await mkdir(instanceLogDir, { recursive: true })
    this.logFile = join(instanceLogDir, `game-${new Date().toISOString().replace(/[:.]/g, '-')}.log`)
    await writeFile(this.logFile, '', 'utf8').catch(() => undefined)

    this.setStatus({
      phase: 'preparing',
      instanceId: instance.id,
      startedAt: Date.now(),
      exitCode: null,
      error: null
    })

    try {
      const minecraft = MinecraftFolder.from(this.paths.root)
      const version = await Version.parse(minecraft, instance.resolvedVersionId)
      const java = await this.options.java.ensure({
        component: version.javaVersion?.component ?? null,
        requiredMajor: version.javaVersion?.majorVersion ?? null,
        manualPath: instance.javaPath,
        signal: AbortSignal.timeout(60_000)
      })
      this.info(instance.id, `Java ${java.version} (${java.source}) at ${java.path}`)

      const gamePath = this.paths.instance(instance.id)
      await mkdir(gamePath, { recursive: true })

      const proc = await launch({
        gamePath,
        resourcePath: this.paths.root,
        javaPath: java.path,
        version: instance.resolvedVersionId,
        gameProfile: { name: account.name, id: account.uuid },
        accessToken: account.accessToken,
        userType: account.type === 'offline' ? 'legacy' : 'mojang',
        launcherName: 'KakeraMC',
        launcherBrand: 'KakeraMC',
        maxMemory: request.memoryMb,
        minMemory: Math.min(1024, request.memoryMb),
        extraJVMArgs: request.jvmArgs,
        versionType: 'KakeraMC'
      })

      this.process = proc
      this.setStatus({ ...this.status, phase: 'starting' })

      proc.stdout?.on('data', (chunk: Buffer) => this.ingest(instance.id, 'stdout', chunk))
      proc.stderr?.on('data', (chunk: Buffer) => this.ingest(instance.id, 'stderr', chunk))

      const watcher = createMinecraftProcessWatcher(proc)
      watcher.on('minecraft-window-ready', () => {
        this.setStatus({ ...this.status, phase: 'running' })
      })
      watcher.on('minecraft-exit', (event) => {
        this.info(instance.id, `Game exited with code ${event.code}${event.crashReportLocation ? ` (crash report: ${event.crashReportLocation})` : ''}`)
        this.setStatus({
          ...this.status,
          phase: event.code === 0 ? 'exited' : 'crashed',
          exitCode: event.code,
          error: event.code === 0 ? null : { code: 'launch.failed', message: `Minecraft exited with code ${event.code}`, detail: event.crashReportLocation || undefined }
        })
        this.process = null
      })
      watcher.on('error', (error: unknown) => {
        const appError = toAppError(error)
        this.info(instance.id, `Launch error: ${appError.message}`)
        this.setStatus({ ...this.status, phase: 'crashed', error: appError })
        this.process = null
      })
    } catch (error) {
      const appError = toAppError(error)
      this.setStatus({ ...this.status, phase: 'crashed', error: appError })
      throw error
    }
  }

  async stop(): Promise<void> {
    const proc = this.process
    if (!proc || proc.pid === undefined) return
    this.info(this.status.instanceId ?? 'unknown', 'Stopping the game process')
    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        const killer = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
        killer.on('exit', () => resolve())
        killer.on('error', () => resolve())
      })
    } else {
      proc.kill('SIGTERM')
    }
    this.process = null
    this.setStatus({ ...this.status, phase: 'exited', exitCode: null, error: null })
  }

  dispose(): void {
    // The game keeps running when the launcher quits; only our handles are released.
    this.process = null
    this.stateListeners.clear()
    this.logListeners.clear()
  }

  private ingest(instanceId: string, stream: 'stdout' | 'stderr', chunk: Buffer): void {
    const text = chunk.toString('utf8')
    for (const rawLine of text.split(/\r?\n/)) {
      const line = scrubSecrets(rawLine.trimEnd())
      if (!line) continue
      const entry: LogLine = { seq: this.seq++, stream, text: line, at: Date.now() }
      const buffer = this.buffers.get(instanceId) ?? []
      buffer.push(entry)
      if (buffer.length > LOG_LIMIT) buffer.splice(0, buffer.length - LOG_LIMIT)
      this.buffers.set(instanceId, buffer)
      for (const listener of this.logListeners) listener(entry)
      if (this.logFile) {
        void import('node:fs/promises')
          .then(({ appendFile }) => appendFile(this.logFile as string, `${line}\n`, 'utf8'))
          .catch(() => undefined)
      }
    }
  }

  private info(instanceId: string, message: string): void {
    const entry: LogLine = { seq: this.seq++, stream: 'app', text: message, at: Date.now() }
    const buffer = this.buffers.get(instanceId) ?? []
    buffer.push(entry)
    this.buffers.set(instanceId, buffer)
    for (const listener of this.logListeners) listener(entry)
    this.options.log.write(`[launch:${instanceId}] ${message}`)
  }

  private setStatus(status: LaunchStatus): void {
    this.status = status
    for (const listener of this.stateListeners) listener(status)
  }
}

/** Exported for tests: maps an exit code to the phase the UI must show. */
export function phaseForExit(code: number | null): LaunchPhase {
  return code === 0 ? 'exited' : 'crashed'
}

export function launchError(message: string): AppError {
  return { code: 'launch.failed', message }
}
