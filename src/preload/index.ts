import { contextBridge, ipcRenderer } from 'electron'
import { CH, EVT } from '@shared/channels'
import type { KakeraApi } from '@shared/types'

interface ErrorEnvelope {
  ok: false
  error: { code: string; message: string; detail?: string }
}

interface ValueEnvelope<T> {
  ok: true
  value: T
}

async function invoke<T>(channel: string, arg?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, arg)) as ValueEnvelope<T> | ErrorEnvelope
  if (!result || typeof result !== 'object' || !('ok' in result)) {
    throw new Error(`Malformed IPC response for ${channel}`)
  }
  if (!result.ok) {
    const error = new Error(result.error.message) as Error & { code: string; detail?: string }
    error.code = result.error.code
    error.detail = result.error.detail
    throw error
  }
  return result.value
}

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: KakeraApi = {
  getAppInfo: () => invoke(CH.appInfo),
  getSettings: () => invoke(CH.settingsGet),
  updateSettings: (patch) => invoke(CH.settingsUpdate, patch),

  listInstances: () => invoke(CH.instancesList),
  createInstance: (input) => invoke(CH.instancesCreate, input),
  renameInstance: (input) => invoke(CH.instancesRename, input),
  deleteInstance: (input) => invoke(CH.instancesDelete, input),
  verifyInstance: (input) => invoke(CH.instancesVerify, input),

  listMinecraftVersions: () => invoke(CH.versionsList),
  listLoaderVersions: (query) => invoke(CH.loadersList, query),

  startInstall: (input) => invoke(CH.installStart, input),
  cancelTask: (input) => invoke(CH.taskCancel, input),
  listTasks: () => invoke(CH.tasksList),

  launch: (input) => invoke(CH.launchStart, input),
  stopLaunch: () => invoke(CH.launchStop),
  getLaunchStatus: () => invoke(CH.launchStatus),
  getLogs: (input) => invoke(CH.logsTail, input),
  openLogs: (input) => invoke(CH.logsOpen, input),

  getAccounts: () => invoke(CH.accountsGet),
  addMicrosoftAccount: () => invoke(CH.accountsAddMicrosoft),
  addOfflineAccount: (input) => invoke(CH.accountsAddOffline, input),
  removeAccount: (input) => invoke(CH.accountsRemove, input),
  selectAccount: (input) => invoke(CH.accountsSelect, input),
  cancelAuth: () => invoke(CH.accountsCancelAuth),

  openExternal: (url) => invoke(CH.appOpenExternal, url),

  onTasks: (cb) => subscribe(EVT.tasks, cb),
  onLaunchState: (cb) => subscribe(EVT.launchState, cb),
  onLaunchLog: (cb) => subscribe(EVT.launchLog, cb),
  onAccounts: (cb) => subscribe(EVT.accounts, cb),
  onSettings: (cb) => subscribe(EVT.settings, cb)
}

contextBridge.exposeInMainWorld('kakera', api)
