import { ipcMain, shell } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import { CH, EVT } from '@shared/channels'
import { toAppError } from '@shared/errors'
import {
  createInstanceInputSchema,
  instanceRenameSchema,
  loaderQuerySchema,
  logsTailSchema,
  offlineAccountSchema,
  settingsPatchSchema,
  taskIdSchema
} from '@shared/schemas'
import type { AppError } from '@shared/types'
import type { LauncherServices } from '../services/services'
import { APP_ORIGIN, isAllowedExternal, openExternalSafely } from '../window'

type Envelope<T> = { ok: true; value: T } | { ok: false; error: AppError }

const DEV_URL = process.env.ELECTRON_RENDERER_URL

/** Only our own renderer may call privileged channels. */
export function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  if (DEV_URL && url.startsWith(DEV_URL)) return true
  if (url.startsWith(APP_ORIGIN)) return true
  // Packaged fallback when the custom protocol is unavailable.
  return url.startsWith('file://') && url.includes('/out/renderer/')
}

export function registerIpc(services: LauncherServices, getWindow: () => BrowserWindow | null): void {
  const handle = <T>(
    channel: string,
    schema: z.ZodTypeAny | null,
    handler: (arg: never) => Promise<T> | T
  ): void => {
    ipcMain.handle(channel, async (event, raw: unknown): Promise<Envelope<T>> => {
      try {
        if (!isTrustedSender(event)) {
          throw new Error(`Rejected IPC call from untrusted frame: ${event.senderFrame?.url ?? 'unknown'}`)
        }
        const arg = (schema ? schema.parse(raw) : undefined) as never
        return { ok: true, value: await handler(arg) }
      } catch (error) {
        const appError = toAppError(error)
        services.log.write(`IPC ${channel} failed: ${appError.code} ${appError.message}`)
        return { ok: false, error: appError }
      }
    })
  }

  handle(CH.appInfo, null, () => services.info())
  handle(CH.settingsGet, null, () => services.settings.get())
  handle(CH.settingsUpdate, settingsPatchSchema, (patch) => services.settings.update(patch))

  handle(CH.instancesList, null, () => services.instances.list())
  handle(CH.instancesCreate, createInstanceInputSchema, (input) => services.instances.create(input))
  handle(CH.instancesRename, instanceRenameSchema, async ({ id, name }) => {
    await services.instances.rename(id, name)
  })
  handle(CH.instancesDelete, taskIdSchema, async ({ id }) => {
    await services.instances.remove(id)
  })
  handle(CH.instancesVerify, taskIdSchema, ({ id }) => services.verify(id))

  handle(CH.versionsList, null, () => services.listVersions())
  handle(CH.loadersList, loaderQuerySchema, ({ mcVersion, loader }) =>
    services.listLoaders(mcVersion, loader)
  )

  handle(CH.installStart, taskIdSchema, ({ id }) => services.startInstall(id))
  handle(CH.taskCancel, taskIdSchema, ({ id }) => {
    services.tasks.cancel(id)
  })
  handle(CH.tasksList, null, () => services.tasks.list())

  handle(CH.launchStart, taskIdSchema, ({ id }) => services.launchInstance(id))
  handle(CH.launchStop, null, () => services.launch.stop())
  handle(CH.launchStatus, null, () => services.launch.getStatus())

  handle(CH.logsTail, logsTailSchema, ({ id, limit }) => services.launch.getLog(id, limit))
  handle(CH.logsOpen, taskIdSchema, async ({ id }) => {
    const dir = join(services.settings.get().gameRoot, 'instances', id, 'logs')
    const error = await shell.openPath(dir)
    if (error) throw new Error(error)
  })

  handle(CH.accountsGet, null, () => services.accounts.state())
  handle(CH.accountsAddMicrosoft, null, () => services.accounts.addMicrosoft())
  handle(CH.accountsAddOffline, offlineAccountSchema, ({ name }) => services.accounts.addOffline(name))
  handle(CH.accountsRemove, taskIdSchema, ({ id }) => services.accounts.remove(id))
  handle(CH.accountsSelect, taskIdSchema, ({ id }) => services.accounts.select(id))
  handle(CH.accountsCancelAuth, null, () => services.accounts.cancelAuth())

  handle(CH.appOpenExternal, z.string().url(), async (url) => {
    if (!isAllowedExternal(url)) throw new Error(`Blocked external url: ${url}`)
    await openExternalSafely(url)
  })

  const send = (channel: string, payload: unknown): void => {
    const window = getWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(channel, payload)
  }

  services.onTasks((tasks) => send(EVT.tasks, tasks))
  services.onLaunchState((status) => send(EVT.launchState, status))
  services.onLaunchLog((line) => send(EVT.launchLog, line))
  services.onAccounts((state) => send(EVT.accounts, state))
  services.onSettings((settings) => send(EVT.settings, settings))
}
