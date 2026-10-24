import { join } from 'node:path'
import { safeStorage } from 'electron'
import { KakeraError, toAppError } from '@shared/errors'
import type {
  AccountState,
  AppInfo,
  AuthPrompt,
  InstanceSummary,
  LoaderOption,
  LoaderType,
  TaskSnapshot,
  VerifyReport,
  VersionOption
} from '@shared/types'
import { FileLogger } from '../core/log'
import { TaskBus } from '../core/tasks/bus'
import { SettingsService, DEFAULT_MEMORY_MB } from '../core/settings/store'
import { InstanceService } from '../core/instances/store'
import { VersionCatalog } from '../core/minecraft/versions'
import { JavaService } from '../core/minecraft/java'
import { createInstallRuntimeFactory } from '../core/minecraft/runtime'
import { installInstance, verifyInstance } from '../core/minecraft/install'
import { listLoaderVersions } from '../core/minecraft/loaders'
import { LaunchService } from '../core/launch'
import { AccountService } from '../core/auth/accounts'
import { MicrosoftAuth } from '../core/auth/microsoft'
import { TokenVault } from '../core/auth/vault'
import type { EncryptionBox } from '../core/auth/vault'
import { FakeBackend } from './fake'

export interface ServiceDeps {
  userDataDir: string
  appVersion: string
  openExternal: (url: string) => Promise<void>
  /** E2E seam: replaces install/launch side effects with deterministic fakes. */
  fake: boolean
}

/**
 * Composition root. Everything privileged lives here; IPC handlers are thin
 * adapters that validate input and call these methods.
 */
export class LauncherServices {
  readonly tasks = new TaskBus()
  readonly catalog = new VersionCatalog()
  readonly settings: SettingsService
  readonly accounts: AccountService
  readonly log: FileLogger
  private readonly fakeBackend: FakeBackend | null
  private readonly vault: TokenVault
  private gameRoot: string
  private instanceService: InstanceService
  private javaService: JavaService
  private launchService: LaunchService

  constructor(private readonly deps: ServiceDeps, log: FileLogger) {
    this.log = log
    this.settings = new SettingsService(deps.userDataDir)
    this.vault = new TokenVault(deps.userDataDir, createSafeStorageBox())
    this.accounts = new AccountService(deps.userDataDir, this.vault, (onPrompt) => this.createMicrosoftAuth(onPrompt))
    this.fakeBackend = deps.fake ? new FakeBackend(() => this.gameRoot) : null
    this.gameRoot = ''
    this.instanceService = new InstanceService(deps.userDataDir)
    this.javaService = new JavaService(deps.userDataDir, this.log, this.runtimeFactory())
    this.launchService = new LaunchService({ gameRoot: deps.userDataDir, java: this.javaService, log: this.log })
  }

  async init(): Promise<void> {
    const settings = await this.settings.load()
    this.gameRoot = settings.gameRoot
    this.rebuildGameRootServices()
    await this.accounts.init()
    await this.vault.load()
    this.settings.onChange((next) => {
      if (next.gameRoot !== this.gameRoot) {
        this.gameRoot = next.gameRoot
        this.rebuildGameRootServices()
      }
      for (const listener of this.settingsListeners) listener(next)
    })
    this.accounts.onChange((state) => this.emitAccounts(state))
    this.tasks.subscribe((tasks) => {
      for (const listener of this.taskListeners) listener(tasks)
    })
  }

  private readonly accountsListeners = new Set<(state: AccountState) => void>()
  private readonly settingsListeners = new Set<(settings: ReturnType<SettingsService['get']>) => void>()
  private readonly instanceListeners = new Set<(instances: InstanceSummary[]) => void>()
  private readonly taskListeners = new Set<(tasks: TaskSnapshot[]) => void>()

  onAccounts(listener: (state: AccountState) => void): () => void {
    this.accountsListeners.add(listener)
    return () => this.accountsListeners.delete(listener)
  }

  onSettings(listener: (settings: ReturnType<SettingsService['get']>) => void): () => void {
    this.settingsListeners.add(listener)
    return () => this.settingsListeners.delete(listener)
  }

  onInstances(listener: (instances: InstanceSummary[]) => void): () => void {
    this.instanceListeners.add(listener)
    return () => this.instanceListeners.delete(listener)
  }

  onTasks(listener: (tasks: TaskSnapshot[]) => void): () => void {
    this.taskListeners.add(listener)
    return () => this.taskListeners.delete(listener)
  }

  async info(): Promise<AppInfo> {
    const settings = this.settings.get()
    return {
      appVersion: this.deps.appVersion,
      electron: process.versions.electron ?? '0',
      chrome: process.versions.chrome ?? '0',
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      userDataDir: this.deps.userDataDir,
      gameRoot: settings.gameRoot,
      defaultMemoryMb: DEFAULT_MEMORY_MB,
      msClientIdConfigured: Boolean(settings.microsoftClientId ?? process.env.KAKERAMC_MS_CLIENT_ID),
      fakeBackend: this.fakeBackend !== null
    }
  }

  get instances(): InstanceService {
    return this.instanceService
  }

  get java(): JavaService {
    return this.javaService
  }

  get launch(): LaunchService {
    return this.launchService
  }

  async listVersions(): Promise<VersionOption[]> {
    if (this.fakeBackend) {
      return [
        { id: '1.99.0', type: 'release', releasedAt: '2026-01-01T00:00:00+00:00' },
        { id: '1.98.0', type: 'release', releasedAt: '2025-06-01T00:00:00+00:00' }
      ]
    }
    const list = await this.catalog.list()
    return list.versions.map((version) => ({
      id: version.id,
      type: version.type as VersionOption['type'],
      releasedAt: version.releaseTime
    }))
  }

  async listLoaders(mcVersion: string, loader: LoaderType): Promise<LoaderOption[]> {
    if (this.fakeBackend) {
      return loader === 'vanilla' ? [] : [{ version: '9.9.9', stable: true }]
    }
    return listLoaderVersions(mcVersion, loader)
  }

  async startInstall(instanceId: string): Promise<TaskSnapshot> {
    const record = await this.instances.get(instanceId)
    const task = this.tasks.create('install', instanceId, 'install.label.metadata')
    const snapshot = this.tasks.get(task.id)
    if (!snapshot) throw new KakeraError('install.failed', 'Task registry lost the new task')

    void this.runInstall(record, task)
    return { ...snapshot }
  }

  private async runInstall(
    record: Awaited<ReturnType<InstanceService['get']>>,
    task: ReturnType<TaskBus['create']>
  ): Promise<void> {
    try {
      if (this.fakeBackend) {
        const resolvedVersionId = await this.fakeBackend.install(record, task)
        await this.instances.markInstalled(record.id, resolvedVersionId)
        task.succeed()
        return
      }
      const result = await installInstance({
        gameRoot: this.gameRoot,
        instance: record,
        catalog: this.catalog,
        java: this.javaService,
        createRuntime: this.runtimeFactory(),
        log: this.log,
        signal: task.signal,
        task
      })
      await this.instances.markInstalled(record.id, result.resolvedVersionId)
      task.succeed()
    } catch (error) {
      if (task.canceled) {
        task.markCanceled()
        this.log.write(`Install canceled for ${record.name}`)
      } else {
        const appError = toAppError(error)
        this.log.write(`Install failed for ${record.name}: ${appError.code} ${appError.message} ${appError.detail ?? ''}`)
        task.fail(appError)
      }
    } finally {
      this.tasks.prune()
      void this.emitInstances()
    }
  }

  async verify(instanceId: string): Promise<VerifyReport> {
    const record = await this.instances.get(instanceId)
    if (!record.resolvedVersionId) {
      throw new KakeraError('launch.instance-not-installed', 'This instance is not installed yet')
    }
    if (this.fakeBackend) return { issues: [] }
    return verifyInstance(
      {
        gameRoot: this.gameRoot,
        instance: record,
        catalog: this.catalog,
        java: this.javaService,
        createRuntime: this.runtimeFactory(),
        log: this.log
      },
      record.resolvedVersionId
    )
  }

  async launchInstance(instanceId: string): Promise<void> {
    const record = await this.instances.get(instanceId)
    if (!record.resolvedVersionId) {
      throw new KakeraError('launch.instance-not-installed', 'Install this instance before launching')
    }
    const settings = this.settings.get()
    const identity = await this.accounts.launchIdentity()
    await this.launch.start({
      instance: record,
      account: identity,
      memoryMb: record.memoryMb ?? settings.memoryMb,
      jvmArgs: [...settings.jvmArgs, ...record.jvmArgs]
    })
    await this.instances.markPlayed(instanceId)
    void this.emitInstances()
  }

  dispose(): void {
    this.tasks.dispose()
    this.launch.dispose()
  }

  private runtimeFactory() {
    return createInstallRuntimeFactory({ concurrency: () => this.settings.get().downloadConcurrency })
  }

  private rebuildGameRootServices(): void {
    this.instanceService = new InstanceService(this.gameRoot)
    this.javaService = new JavaService(this.gameRoot, this.log, this.runtimeFactory())
    this.launchService = new LaunchService({
      gameRoot: this.gameRoot,
      java: this.javaService,
      log: this.log
    })
    this.launchService.onState((status) => {
      for (const listener of this.launchStateListeners) listener(status)
    })
    this.launchService.onLog((line) => {
      for (const listener of this.launchLogListeners) listener(line)
    })
    this.instanceService.onChange(() => void this.emitInstances())
  }

  private readonly launchStateListeners = new Set<(status: ReturnType<LaunchService['getStatus']>) => void>()
  private readonly launchLogListeners = new Set<(line: Parameters<Parameters<LaunchService['onLog']>[0]>[0]) => void>()

  onLaunchState(listener: (status: ReturnType<LaunchService['getStatus']>) => void): () => void {
    this.launchStateListeners.add(listener)
    return () => this.launchStateListeners.delete(listener)
  }

  onLaunchLog(listener: (line: Parameters<Parameters<LaunchService['onLog']>[0]>[0]) => void): () => void {
    this.launchLogListeners.add(listener)
    return () => this.launchLogListeners.delete(listener)
  }

  private emitAccounts(state: AccountState): void {
    for (const listener of this.accountsListeners) listener(state)
  }

  async emitInstances(): Promise<void> {
    const list = await this.instances.list()
    for (const listener of this.instanceListeners) listener(list)
  }

  private createMicrosoftAuth(onPrompt: (prompt: AuthPrompt | null) => void): MicrosoftAuth {
    return new MicrosoftAuth({
      clientId: this.settings.get().microsoftClientId ?? process.env.KAKERAMC_MS_CLIENT_ID ?? null,
      openExternal: this.deps.openExternal,
      onPrompt
    })
  }
}

function createSafeStorageBox(): EncryptionBox {
  return {
    isAvailable: async () => {
      try {
        const api = safeStorage as unknown as { isAsyncEncryptionAvailable?: () => Promise<boolean> }
        if (typeof api.isAsyncEncryptionAvailable === 'function') {
          return await api.isAsyncEncryptionAvailable()
        }
        return safeStorage.isEncryptionAvailable()
      } catch {
        return false
      }
    },
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (payload) => safeStorage.decryptString(payload)
  }
}

export async function createServices(deps: ServiceDeps): Promise<LauncherServices> {
  const log = await FileLogger.open(join(deps.userDataDir, 'logs', 'launcher.log'))
  const services = new LauncherServices(deps, log)
  await services.init()
  return services
}
