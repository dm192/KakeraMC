import type { z } from 'zod'
import type {
  createInstanceInputSchema,
  instanceRenameSchema,
  loaderQuerySchema,
  logsTailSchema,
  offlineAccountSchema,
  settingsPatchSchema,
  settingsSchema,
  taskIdSchema
} from './schemas'

export type Settings = z.infer<typeof settingsSchema>
export type SettingsPatch = z.infer<typeof settingsPatchSchema>
export type CreateInstanceInput = z.infer<typeof createInstanceInputSchema>
export type InstanceRename = z.infer<typeof instanceRenameSchema>
export type LoaderQuery = z.infer<typeof loaderQuerySchema>
export type TaskIdInput = z.infer<typeof taskIdSchema>
export type LogsTailInput = z.infer<typeof logsTailSchema>
export type OfflineAccountInput = z.infer<typeof offlineAccountSchema>

export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'
export type Language = 'zh-CN' | 'en'

/** Stable error codes: the renderer owns the localized wording. */
export type AppErrorCode =
  | 'generic'
  | 'settings.invalid'
  | 'instance.not-found'
  | 'instance.invalid'
  | 'instance.name-taken'
  | 'install.failed'
  | 'install.canceled'
  | 'verify.failed'
  | 'launch.java-missing'
  | 'launch.already-running'
  | 'launch.failed'
  | 'launch.no-account'
  | 'launch.instance-not-installed'
  | 'auth.not-configured'
  | 'auth.canceled'
  | 'auth.timeout'
  | 'auth.state-mismatch'
  | 'auth.failed'
  | 'auth.no-minecraft'
  | 'auth.xbox-blocked'
  | 'auth.needs-reauth'
  | 'account.not-found'
  | 'account.name-invalid'
  | 'net.failed'
  | 'version.not-found'
  | 'loader.unavailable'
  | 'loader.unsupported'

export interface AppError {
  code: AppErrorCode
  /** Technical, English, single line — used for logs and as a fallback. */
  message: string
  /** Optional extra context (HTTP status, path, exit code). Never a token. */
  detail?: string
}

export interface AppInfo {
  appVersion: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
  userDataDir: string
  gameRoot: string
  defaultMemoryMb: number
  msClientIdConfigured: boolean
  /** True when the E2E harness replaced installers and auth with fakes. */
  fakeBackend: boolean
}

export interface InstanceSummary {
  id: string
  name: string
  mcVersion: string
  loader: LoaderType
  loaderVersion: string | null
  resolvedVersionId: string | null
  installed: boolean
  createdAt: string
  lastPlayedAt: string | null
  memoryMb: number | null
  javaPath: string | null
  jvmArgs: string[]
}

export interface VersionOption {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releasedAt: string
}

export interface LoaderOption {
  version: string
  stable: boolean
}

export type TaskState = 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled'
export type TaskUnit = 'bytes' | 'files' | 'steps'
export type TaskKind = 'install' | 'repair'

export interface TaskProgress {
  done: number
  total: number
  unit: TaskUnit
}

export interface TaskSnapshot {
  id: string
  kind: TaskKind
  instanceId: string
  /** i18n key owned by the renderer; main never ships display copy. */
  labelKey: string
  labelParams: Record<string, string | number>
  state: TaskState
  progress: TaskProgress | null
  error: AppError | null
}

export type LaunchPhase = 'idle' | 'preparing' | 'starting' | 'running' | 'exited' | 'crashed'

export interface LaunchStatus {
  phase: LaunchPhase
  instanceId: string | null
  startedAt: number | null
  exitCode: number | null
  error: AppError | null
}

export interface LogLine {
  seq: number
  stream: 'stdout' | 'stderr' | 'app'
  text: string
  at: number
}

export type AuthPrompt =
  | { kind: 'browser' }
  | { kind: 'device-code'; userCode: string; verificationUri: string; expiresAt: number }

export interface AccountView {
  id: string
  type: 'microsoft' | 'offline'
  name: string
  uuid: string
  needsReauth: boolean
}

export interface AccountState {
  accounts: AccountView[]
  selectedId: string | null
  auth: AuthPrompt | null
  /** False when the OS keyring is unavailable, so tokens are memory-only. */
  vaultPersistent: boolean
}

export interface VerifyIssue {
  kind: 'missing' | 'corrupted'
  role: string
  file: string
}

export interface VerifyReport {
  issues: VerifyIssue[]
}

export interface Unsubscribe {
  (): void
}

export interface KakeraApi {
  getAppInfo: () => Promise<AppInfo>
  getSettings: () => Promise<Settings>
  updateSettings: (patch: SettingsPatch) => Promise<Settings>

  listInstances: () => Promise<InstanceSummary[]>
  createInstance: (input: CreateInstanceInput) => Promise<InstanceSummary>
  renameInstance: (input: InstanceRename) => Promise<void>
  deleteInstance: (input: TaskIdInput) => Promise<void>
  verifyInstance: (input: TaskIdInput) => Promise<VerifyReport>

  listMinecraftVersions: () => Promise<VersionOption[]>
  listLoaderVersions: (query: LoaderQuery) => Promise<LoaderOption[]>

  startInstall: (input: TaskIdInput) => Promise<TaskSnapshot>
  cancelTask: (input: TaskIdInput) => Promise<void>
  listTasks: () => Promise<TaskSnapshot[]>

  launch: (input: TaskIdInput) => Promise<void>
  stopLaunch: () => Promise<void>
  getLaunchStatus: () => Promise<LaunchStatus>
  getLogs: (input: LogsTailInput) => Promise<LogLine[]>
  openLogs: (input: TaskIdInput) => Promise<void>

  getAccounts: () => Promise<AccountState>
  addMicrosoftAccount: () => Promise<void>
  addOfflineAccount: (input: OfflineAccountInput) => Promise<AccountState>
  removeAccount: (input: TaskIdInput) => Promise<AccountState>
  selectAccount: (input: TaskIdInput) => Promise<AccountState>
  cancelAuth: () => Promise<void>

  openExternal: (url: string) => Promise<void>

  onTasks: (cb: (tasks: TaskSnapshot[]) => void) => Unsubscribe
  onLaunchState: (cb: (status: LaunchStatus) => void) => Unsubscribe
  onLaunchLog: (cb: (line: LogLine) => void) => Unsubscribe
  onAccounts: (cb: (state: AccountState) => void) => Unsubscribe
  onSettings: (cb: (settings: Settings) => void) => Unsubscribe
}
