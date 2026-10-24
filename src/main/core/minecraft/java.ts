import { arch, platform } from 'node:process'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { createJavaRuntimeInstallWorkflow } from '@xmcl/installer'
import type { JavaRuntimes } from '@xmcl/installer'
import { getPotentialJavaLocations, resolveJava, scanLocalJava } from '@xmcl/installer'
import { KakeraError } from '@shared/errors'
import { gamePaths } from '../paths'
import type { LogSink } from '../log'
import type { InstallRuntimeFactory } from './runtime'
import type { TaskHandle } from '../tasks/bus'

export type JavaSource = 'manual' | 'managed' | 'system'

export interface JavaRuntime {
  path: string
  version: string
  major: number
  source: JavaSource
}

export interface EnsureJavaOptions {
  /** Mojang runtime component id from the version JSON (e.g. java-runtime-epsilon). */
  component: string | null
  requiredMajor: number | null
  manualPath: string | null
  signal: AbortSignal
  task?: TaskHandle
}

/** Mojang runtime platform keys, matching the launcher's runtime index. */
export function runtimePlatformKey(platformName = platform, cpuArch = arch): keyof JavaRuntimes | null {
  if (platformName === 'win32') {
    if (cpuArch === 'x64') return 'windows-x64'
    if (cpuArch === 'ia32') return 'windows-x86'
    if (cpuArch === 'arm64') return 'windows-arm64'
    return null
  }
  if (platformName === 'darwin') return cpuArch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  if (platformName === 'linux') return cpuArch === 'ia32' ? 'linux-i386' : 'linux'
  return null
}

export function javaExecutableName(platformName = platform): string {
  return platformName === 'win32' ? 'java.exe' : 'java'
}

/**
 * Resolves a usable JVM: an explicit user path, an already provisioned Mojang
 * runtime, a matching system JVM, or a freshly downloaded Mojang runtime.
 */
export class JavaService {
  private readonly paths
  private detected: JavaRuntime[] | null = null

  constructor(
    gameRoot: string,
    private readonly log: LogSink,
    private readonly createRuntime: InstallRuntimeFactory
  ) {
    this.paths = gamePaths(gameRoot)
  }

  runtimeDir(component: string): string {
    const key = runtimePlatformKey()
    if (!key) throw new KakeraError('launch.java-missing', `Unsupported platform for Java runtime: ${platform}/${arch}`)
    return join(this.paths.runtime, component, key)
  }

  runtimeExecutable(component: string): string {
    return join(this.runtimeDir(component), 'bin', javaExecutableName())
  }

  /** Managed runtimes already on disk plus every JVM discovered on this machine. */
  async detectAll(force = false): Promise<JavaRuntime[]> {
    if (this.detected && !force) return this.detected
    const found: JavaRuntime[] = []
    const locations = await getPotentialJavaLocations().catch(() => [] as string[])
    const scanned = await scanLocalJava(locations).catch(() => [])
    for (const info of scanned) {
      found.push({ path: info.path, version: info.version, major: info.majorVersion, source: 'system' })
    }
    for (const component of await this.listManagedComponents()) {
      const path = this.runtimeExecutable(component)
      const info = await resolveJava(path).catch(() => undefined)
      if (info) found.push({ path, version: info.version, major: info.majorVersion, source: 'managed' })
    }
    this.detected = found
    return found
  }

  async ensure(options: EnsureJavaOptions): Promise<JavaRuntime> {
    const { component, requiredMajor, manualPath } = options

    if (manualPath) {
      const info = await resolveJava(manualPath).catch(() => undefined)
      if (!info) {
        throw new KakeraError('launch.java-missing', `The configured Java executable cannot be started: ${manualPath}`)
      }
      return { path: manualPath, version: info.version, major: info.majorVersion, source: 'manual' }
    }

    const all = await this.detectAll()

    if (component) {
      const managedPath = this.runtimeExecutable(component)
      const managed = all.find((java) => java.source === 'managed' && java.path === managedPath)
      if (managed && matchesMajor(managed.major, requiredMajor)) return managed
    }

    if (requiredMajor !== null) {
      const exact = all.find((java) => java.major === requiredMajor)
      if (exact) return exact
    }

    if (component) {
      this.log.write(`Provisioning Minecraft Java runtime "${component}"`)
      const installed = await this.installRuntime(component, options.signal, options.task)
      this.detected = null
      return installed
    }

    const fallback = all.find((java) => requiredMajor === null || java.major >= requiredMajor)
    if (fallback) return fallback

    throw new KakeraError(
      'launch.java-missing',
      `No compatible Java runtime found${requiredMajor ? ` (Java ${requiredMajor} required)` : ''}`,
      requiredMajor ? `required-major:${requiredMajor}` : undefined
    )
  }

  async installRuntime(component: string, signal: AbortSignal, task?: TaskHandle): Promise<JavaRuntime> {
    const key = runtimePlatformKey()
    if (!key) throw new KakeraError('launch.java-missing', `Unsupported platform: ${platform}/${arch}`)
    const index = await this.fetchRuntimeIndex()
    const target = index[key]?.[component]?.[0]
    if (!target) {
      throw new KakeraError('launch.java-missing', `Mojang does not ship runtime "${component}" for ${key}`)
    }
    const destination = this.runtimeDir(component)
    const workflow = createJavaRuntimeInstallWorkflow({ target, destination })
    const runtime = this.createRuntime({ signal, task, labelKey: 'install.label.java', unit: 'bytes' })
    const { executeInstallWorkflow } = await import('@xmcl/installer')
    await executeInstallWorkflow(workflow, runtime.runtime, { signal })
    runtime.stop()
    const info = await resolveJava(this.runtimeExecutable(component))
    if (!info) throw new KakeraError('launch.java-missing', `Provisioned runtime is not executable: ${destination}`)
    return { path: this.runtimeExecutable(component), version: info.version, major: info.majorVersion, source: 'managed' }
  }

  private async listManagedComponents(): Promise<string[]> {
    try {
      const { readdir } = await import('node:fs/promises')
      const entries = await readdir(this.paths.runtime, { withFileTypes: true })
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    } catch {
      return []
    }
  }

  private async fetchRuntimeIndex(): Promise<JavaRuntimes> {
    const response = await fetch('https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json', {
      signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) throw new KakeraError('net.failed', `Runtime index request failed with HTTP ${response.status}`)
    return (await response.json()) as JavaRuntimes
  }

  /** Cheap existence check used before offering a launch button. */
  async isAvailable(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }
}

function matchesMajor(actual: number, required: number | null): boolean {
  return required === null || actual === required
}
