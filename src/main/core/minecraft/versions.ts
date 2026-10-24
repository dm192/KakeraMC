import { getVersionList } from '@xmcl/installer'
import type { MinecraftVersion, MinecraftVersionList } from '@xmcl/installer'
import { KakeraError } from '@shared/errors'

const CACHE_TTL_MS = 10 * 60 * 1000

/** Cached Mojang version manifest. Never hardcodes a Minecraft version. */
export class VersionCatalog {
  private cache: { at: number; list: MinecraftVersionList } | null = null
  private inflight: Promise<MinecraftVersionList> | null = null

  constructor(private readonly ttlMs = CACHE_TTL_MS) {}

  async list(force = false): Promise<MinecraftVersionList> {
    const now = Date.now()
    if (!force && this.cache && now - this.cache.at < this.ttlMs) return this.cache.list
    if (!force && this.inflight) return this.inflight
    this.inflight = getVersionList()
      .then((list) => {
        this.cache = { at: Date.now(), list }
        return list
      })
      .catch((error: unknown) => {
        throw new KakeraError('net.failed', 'Unable to load the Minecraft version manifest', String(error))
      })
      .finally(() => {
        this.inflight = null
      })
    return this.inflight
  }

  async find(id: string): Promise<MinecraftVersion> {
    const list = await this.list()
    const found = list.versions.find((version) => version.id === id)
    if (!found) throw new KakeraError('version.not-found', `Unknown Minecraft version: ${id}`)
    return found
  }

  async latestRelease(): Promise<MinecraftVersion> {
    const list = await this.list()
    return this.find(list.latest.release)
  }
}
