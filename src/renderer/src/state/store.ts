import { create } from 'zustand'
import type {
  AccountState,
  AppError,
  AppInfo,
  CreateInstanceInput,
  InstanceSummary,
  LaunchStatus,
  LogLine,
  Settings,
  SettingsPatch,
  TaskSnapshot,
  VerifyReport
} from '@shared/types'

export type View = 'instances' | 'accounts' | 'settings'

export interface Banner {
  code: string
  message: string
  detail?: string
}

interface Store {
  ready: boolean
  info: AppInfo | null
  settings: Settings | null
  instances: InstanceSummary[]
  accounts: AccountState | null
  tasks: TaskSnapshot[]
  launch: LaunchStatus
  logs: LogLine[]
  verify: { instanceId: string; report: VerifyReport } | null
  verifying: boolean
  view: View
  selectedId: string | null
  filter: string
  banner: Banner | null
  bootError: Banner | null

  init: () => Promise<void>
  setView: (view: View) => void
  select: (id: string | null) => void
  setFilter: (value: string) => void
  refreshInstances: () => Promise<void>
  refreshSettings: () => Promise<void>
  saveSettings: (patch: SettingsPatch) => Promise<boolean>
  createInstance: (input: CreateInstanceInput) => Promise<boolean>
  deleteInstance: (id: string) => Promise<void>
  install: (id: string) => Promise<void>
  installAndPlay: (id: string) => Promise<void>
  cancelTask: (taskId: string) => Promise<void>
  play: (id: string) => Promise<void>
  stop: () => Promise<void>
  verifyInstance: (id: string) => Promise<void>
  openLogs: (id: string) => Promise<void>
  addMicrosoft: () => Promise<void>
  addOffline: (name: string) => Promise<boolean>
  selectAccount: (id: string | null) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  cancelAuth: () => Promise<void>
  dismissBanner: () => void
}

function toBanner(error: unknown): Banner {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: unknown }).code)
    const message = error instanceof Error ? error.message : String(error)
    const detail = (error as { detail?: string }).detail
    return detail ? { code, message, detail } : { code, message }
  }
  return { code: 'generic', message: error instanceof Error ? error.message : String(error) }
}

function errorOf(error: unknown): AppError {
  return toBanner(error) as AppError
}

const IDLE_LAUNCH: LaunchStatus = {
  phase: 'idle',
  instanceId: null,
  startedAt: null,
  exitCode: null,
  error: null
}

export const useStore = create<Store>((set, get) => {
  const pendingLaunch = new Set<string>()
  let initStarted = false

  const refetchAccounts = async (): Promise<void> => {
    set({ accounts: await window.kakera.getAccounts() })
  }

  return {
    ready: false,
    info: null,
    settings: null,
    instances: [],
    accounts: null,
    tasks: [],
    launch: IDLE_LAUNCH,
    logs: [],
    verify: null,
    verifying: false,
    view: 'instances',
    selectedId: null,
    filter: '',
    banner: null,
    bootError: null,

    async init() {
      if (initStarted) return
      initStarted = true
      try {
        const [info, settings, instances, accounts, tasks, launch] = await Promise.all([
          window.kakera.getAppInfo(),
          window.kakera.getSettings(),
          window.kakera.listInstances(),
          window.kakera.getAccounts(),
          window.kakera.listTasks(),
          window.kakera.getLaunchStatus()
        ])
        const selectedId = instances[0]?.id ?? null
        set({ info, settings, instances, accounts, tasks, launch, selectedId, ready: true })

        window.kakera.onTasks((next) => {
          const previous = get().tasks
          set({ tasks: next })
          for (const task of next) {
            const before = previous.find((candidate) => candidate.id === task.id)
            if (task.state === 'succeeded' && before?.state !== 'succeeded') {
              void get().refreshInstances()
              if (pendingLaunch.delete(task.instanceId)) {
                void get().play(task.instanceId)
              }
            }
          }
        })
        window.kakera.onLaunchState((status) => {
          set({ launch: status })
        })
        window.kakera.onLaunchLog((line) => {
          const logs = [...get().logs, line]
          set({ logs: logs.length > 2_000 ? logs.slice(logs.length - 2_000) : logs })
        })
        window.kakera.onAccounts((state) => set({ accounts: state }))
        window.kakera.onSettings((settingsNext) => set({ settings: settingsNext }))
      } catch (error) {
        set({ bootError: toBanner(error), ready: true })
      }
    },

    setView(view) {
      set({ view })
    },

    select(id) {
      set({ selectedId: id, logs: [], verify: null })
      if (id) void window.kakera.getLogs({ id, limit: 400 }).then((logs) => set({ logs }))
    },

    setFilter(value) {
      set({ filter: value })
    },

    async refreshInstances() {
      const instances = await window.kakera.listInstances()
      const selectedId = get().selectedId
      set({
        instances,
        selectedId: selectedId && instances.some((instance) => instance.id === selectedId) ? selectedId : (instances[0]?.id ?? null)
      })
    },

    async refreshSettings() {
      set({ settings: await window.kakera.getSettings() })
    },

    async saveSettings(patch) {
      try {
        const settings = await window.kakera.updateSettings(patch)
        set({ settings, banner: null })
        void get().refreshInstances()
        return true
      } catch (error) {
        set({ banner: toBanner(error) })
        return false
      }
    },

    async createInstance(input) {
      try {
        const instance = await window.kakera.createInstance(input)
        await get().refreshInstances()
        set({ selectedId: instance.id, banner: null, view: 'instances', verify: null })
        return true
      } catch (error) {
        set({ banner: toBanner(error) })
        return false
      }
    },

    async deleteInstance(id) {
      try {
        await window.kakera.deleteInstance({ id })
        await get().refreshInstances()
        set({ banner: null, logs: [], verify: null })
      } catch (error) {
        set({ banner: toBanner(error) })
      }
    },

    async install(id) {
      try {
        await window.kakera.startInstall({ id })
        set({ banner: null, verify: null })
      } catch (error) {
        set({ banner: toBanner(error) })
      }
    },

    async installAndPlay(id) {
      pendingLaunch.add(id)
      await get().install(id)
      const failed = get().tasks.some((task) => task.instanceId === id && task.state === 'failed')
      if (failed) pendingLaunch.delete(id)
    },

    async cancelTask(taskId) {
      await window.kakera.cancelTask({ id: taskId })
    },

    async play(id) {
      try {
        set({ banner: null })
        await window.kakera.launch({ id })
      } catch (error) {
        set({ banner: toBanner(error) })
      }
    },

    async stop() {
      try {
        await window.kakera.stopLaunch()
      } catch (error) {
        set({ banner: toBanner(error) })
      }
    },

    async verifyInstance(id) {
      set({ verifying: true, verify: null })
      try {
        const report = await window.kakera.verifyInstance({ id })
        set({ verify: { instanceId: id, report }, banner: null })
      } catch (error) {
        set({ banner: toBanner(error) })
      } finally {
        set({ verifying: false })
      }
    },

    async openLogs(id) {
      try {
        await window.kakera.openLogs({ id })
      } catch (error) {
        set({ banner: toBanner(error) })
      }
    },

    async addMicrosoft() {
      try {
        await window.kakera.addMicrosoftAccount()
        await refetchAccounts()
        set({ banner: null })
      } catch (error) {
        set({ banner: toBanner(error) })
        await refetchAccounts()
      }
    },

    async addOffline(name) {
      try {
        const accounts = await window.kakera.addOfflineAccount({ name })
        set({ accounts, banner: null })
        return true
      } catch (error) {
        set({ banner: toBanner(error) })
        return false
      }
    },

    async selectAccount(id) {
      try {
        set({ accounts: await window.kakera.selectAccount({ id: id ?? '' }) })
      } catch (error) {
        set({ banner: toBanner(error) })
      }
    },

    async removeAccount(id) {
      try {
        set({ accounts: await window.kakera.removeAccount({ id }) })
      } catch (error) {
        set({ banner: toBanner(error) })
      }
    },

    async cancelAuth() {
      await window.kakera.cancelAuth()
    },

    dismissBanner() {
      set({ banner: null })
    }
  }
})

export function selectedInstance(state: Store): InstanceSummary | null {
  return state.instances.find((instance) => instance.id === state.selectedId) ?? null
}

export function activeTask(state: Store): TaskSnapshot | null {
  return (
    state.tasks.find(
      (task) =>
        task.instanceId === state.selectedId && (task.state === 'running' || task.state === 'pending')
    ) ?? null
  )
}

export function instanceTask(state: Store, instanceId: string): TaskSnapshot | null {
  return (
    state.tasks.find(
      (task) => task.instanceId === instanceId && (task.state === 'running' || task.state === 'pending')
    ) ?? null
  )
}

export { errorOf }
