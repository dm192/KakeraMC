/**
 * IPC channel names shared by the main process, the preload bridge and the
 * renderer. This module is values-only (no dependencies) so it can be imported
 * from the sandboxed preload bundle.
 */
export const CH = {
  appInfo: 'app:info',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  instancesList: 'instances:list',
  instancesCreate: 'instances:create',
  instancesRename: 'instances:rename',
  instancesDelete: 'instances:delete',
  instancesVerify: 'instances:verify',

  versionsList: 'versions:list',
  loadersList: 'loaders:list',

  installStart: 'install:start',
  taskCancel: 'task:cancel',
  tasksList: 'tasks:list',

  launchStart: 'launch:start',
  launchStop: 'launch:stop',
  launchStatus: 'launch:status',

  logsTail: 'logs:tail',
  logsOpen: 'logs:open',

  accountsGet: 'accounts:get',
  accountsAddMicrosoft: 'accounts:add-microsoft',
  accountsAddOffline: 'accounts:add-offline',
  accountsRemove: 'accounts:remove',
  accountsSelect: 'accounts:select',
  accountsCancelAuth: 'accounts:cancel-auth',

  appOpenExternal: 'app:open-external'
} as const

export interface ChannelMap {
  [CH.appInfo]: []
  [CH.settingsGet]: []
  [CH.settingsUpdate]: [unknown]
  [CH.instancesList]: []
  [CH.instancesCreate]: [unknown]
  [CH.instancesRename]: [unknown]
  [CH.instancesDelete]: [unknown]
  [CH.instancesVerify]: [unknown]
  [CH.versionsList]: []
  [CH.loadersList]: [unknown]
  [CH.installStart]: [unknown]
  [CH.taskCancel]: [unknown]
  [CH.tasksList]: []
  [CH.launchStart]: [unknown]
  [CH.launchStop]: []
  [CH.launchStatus]: []
  [CH.logsTail]: [unknown]
  [CH.logsOpen]: [unknown]
  [CH.accountsGet]: []
  [CH.accountsAddMicrosoft]: []
  [CH.accountsAddOffline]: [unknown]
  [CH.accountsRemove]: [unknown]
  [CH.accountsSelect]: [unknown]
  [CH.accountsCancelAuth]: []
  [CH.appOpenExternal]: [unknown]
}

export type Channel = keyof ChannelMap

/** Push events from main to renderer. */
export const EVT = {
  tasks: 'evt:tasks',
  launchState: 'evt:launch-state',
  launchLog: 'evt:launch-log',
  accounts: 'evt:accounts',
  settings: 'evt:settings'
} as const
