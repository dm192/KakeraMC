import { join } from 'node:path'
import type { Settings, SettingsPatch } from '@shared/types'
import { settingsPatchSchema, settingsSchema } from '@shared/schemas'
import { JsonFile } from '../fsx'
import { KakeraError } from '@shared/errors'

export const DEFAULT_MEMORY_MB = 4096

export function defaultSettings(userDataDir: string): Settings {
  return {
    language: 'zh-CN',
    gameRoot: join(userDataDir, 'minecraft'),
    memoryMb: DEFAULT_MEMORY_MB,
    jvmArgs: [],
    downloadConcurrency: 8,
    javaPath: null,
    microsoftClientId: null
  }
}

/** Persisted user settings with validation and change notification. */
export class SettingsService {
  private readonly file: JsonFile<Settings>
  private readonly defaults: Settings
  private current: Settings | null = null
  private readonly listeners = new Set<(settings: Settings) => void>()

  constructor(userDataDir: string) {
    this.defaults = defaultSettings(userDataDir)
    this.file = new JsonFile<Settings>(join(userDataDir, 'settings.json'))
  }

  async load(): Promise<Settings> {
    if (this.current) return this.current
    const loaded = await this.file.read(
      (raw) => settingsSchema.parse(raw),
      () => this.defaults
    )
    this.current = loaded
    return loaded
  }

  get(): Settings {
    if (!this.current) throw new Error('SettingsService.load() must run before get()')
    return this.current
  }

  async update(patch: SettingsPatch): Promise<Settings> {
    const current = await this.load()
    const parsedPatch = settingsPatchSchema.safeParse(patch)
    if (!parsedPatch.success) {
      throw new KakeraError('settings.invalid', 'Settings are invalid', parsedPatch.error.issues[0]?.message)
    }
    const next: Settings = { ...current, ...parsedPatch.data }
    const parsed = settingsSchema.safeParse(next)
    if (!parsed.success) {
      throw new KakeraError('settings.invalid', 'Settings are invalid', parsed.error.issues[0]?.message)
    }
    this.current = parsed.data
    await this.file.write(parsed.data)
    for (const listener of this.listeners) listener(parsed.data)
    return parsed.data
  }

  onChange(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
