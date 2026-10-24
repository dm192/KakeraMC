import type { AppError, KakeraApi } from '@shared/types'
import { CH, EVT } from '@shared/channels'

type Envelope<T> = { ok: true; value: T } | { ok: false; error: AppError }

export interface KakeraBridge {
  invoke(channel: string, arg?: unknown): Promise<Envelope<unknown>>
  on(channel: string, callback: (payload: unknown) => void): () => void
}

/**
 * Errors thrown here are created in this realm, so `code` survives. Errors that
 * cross `contextBridge` lose custom properties, which is why the bridge returns
 * envelopes instead of rejecting.
 */
export class ApiError extends Error {
  readonly code: AppError['code']
  readonly detail: string | undefined

  constructor(error: AppError) {
    super(error.message)
    this.name = 'ApiError'
    this.code = error.code
    this.detail = error.detail
  }
}

function bridge(): KakeraBridge {
  const value = (window as unknown as { kakeraBridge?: KakeraBridge }).kakeraBridge
  if (!value) throw new Error('The preload bridge is unavailable')
  return value
}

async function call<T>(channel: string, arg?: unknown): Promise<T> {
  const result = await bridge().invoke(channel, arg)
  if (!result || typeof result !== 'object' || !('ok' in result)) {
    throw new Error(`Malformed IPC response for ${channel}`)
  }
  if (!result.ok) throw new ApiError(result.error)
  return result.value as T
}

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  return bridge().on(channel, (payload) => callback(payload as T))
}

export const api: KakeraApi = {
  getAppInfo: () => call(CH.appInfo),
  getSettings: () => call(CH.settingsGet),
  updateSettings: (patch) => call(CH.settingsUpdate, patch),

  listInstances: () => call(CH.instancesList),
  createInstance: (input) => call(CH.instancesCreate, input),
  renameInstance: (input) => call(CH.instancesRename, input),
  deleteInstance: (input) => call(CH.instancesDelete, input),
  verifyInstance: (input) => call(CH.instancesVerify, input),

  listMinecraftVersions: () => call(CH.versionsList),
  listLoaderVersions: (query) => call(CH.loadersList, query),

  startInstall: (input) => call(CH.installStart, input),
  cancelTask: (input) => call(CH.taskCancel, input),
  listTasks: () => call(CH.tasksList),

  launch: (input) => call(CH.launchStart, input),
  stopLaunch: () => call(CH.launchStop),
  getLaunchStatus: () => call(CH.launchStatus),
  getLogs: (input) => call(CH.logsTail, input),
  openLogs: (input) => call(CH.logsOpen, input),

  getAccounts: () => call(CH.accountsGet),
  addMicrosoftAccount: () => call(CH.accountsAddMicrosoft),
  addOfflineAccount: (input) => call(CH.accountsAddOffline, input),
  removeAccount: (input) => call(CH.accountsRemove, input),
  selectAccount: (input) => call(CH.accountsSelect, input),
  cancelAuth: () => call(CH.accountsCancelAuth),

  openExternal: (url) => call(CH.appOpenExternal, url),

  onTasks: (cb) => subscribe(EVT.tasks, cb),
  onLaunchState: (cb) => subscribe(EVT.launchState, cb),
  onLaunchLog: (cb) => subscribe(EVT.launchLog, cb),
  onAccounts: (cb) => subscribe(EVT.accounts, cb),
  onSettings: (cb) => subscribe(EVT.settings, cb)
}
