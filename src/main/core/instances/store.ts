import { randomUUID } from 'node:crypto'
import { access, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { loaderTypeSchema } from '@shared/schemas'
import { KakeraError } from '@shared/errors'
import type { CreateInstanceInput, InstanceSummary } from '@shared/types'
import { readJsonIfExists, writeJson } from '../fsx'
import { assertSafeSegment, gamePaths } from '../paths'

const instanceRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().min(1),
  lastPlayedAt: z.string().nullable(),
  mcVersion: z.string().min(1),
  loader: loaderTypeSchema,
  loaderVersion: z.string().nullable(),
  resolvedVersionId: z.string().nullable(),
  javaPath: z.string().nullable(),
  memoryMb: z.number().int().nullable(),
  jvmArgs: z.array(z.string())
})

export type InstanceRecord = z.infer<typeof instanceRecordSchema>

/** Filesystem-backed instance registry; one JSON document per instance. */
export class InstanceService {
  private readonly paths
  private readonly listeners = new Set<() => void>()

  constructor(gameRoot: string) {
    this.paths = gamePaths(gameRoot)
  }

  private recordPath(id: string): string {
    return join(this.paths.instance(assertSafeSegment(id, 'instance id')), 'instance.json')
  }

  async list(): Promise<InstanceSummary[]> {
    await mkdir(this.paths.instances, { recursive: true })
    const entries = await readdir(this.paths.instances, { withFileTypes: true })
    const records: InstanceRecord[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const record = await this.read(entry.name)
      if (record) records.push(record)
    }
    records.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return Promise.all(records.map((record) => this.toSummary(record)))
  }

  async get(id: string): Promise<InstanceRecord> {
    const record = await this.read(id)
    if (!record) throw new KakeraError('instance.not-found', `Instance ${id} does not exist`)
    return record
  }

  async create(input: CreateInstanceInput): Promise<InstanceSummary> {
    const existing = await this.list()
    if (existing.some((instance) => instance.name.toLowerCase() === input.name.toLowerCase())) {
      throw new KakeraError('instance.name-taken', `Instance name "${input.name}" is already used`)
    }
    const id = randomUUID()
    const now = new Date().toISOString()
    const record: InstanceRecord = {
      schemaVersion: 1,
      id,
      name: input.name,
      createdAt: now,
      lastPlayedAt: null,
      mcVersion: input.mcVersion,
      loader: input.loader,
      loaderVersion: input.loaderVersion ?? null,
      resolvedVersionId: null,
      javaPath: null,
      memoryMb: null,
      jvmArgs: []
    }
    await mkdir(this.paths.instance(id), { recursive: true })
    await mkdir(join(this.paths.instance(id), 'mods'), { recursive: true })
    await writeJson(this.recordPath(id), record)
    return this.toSummary(record)
  }

  async rename(id: string, name: string): Promise<void> {
    const record = await this.get(id)
    const others = await this.list()
    if (others.some((instance) => instance.id !== id && instance.name.toLowerCase() === name.toLowerCase())) {
      throw new KakeraError('instance.name-taken', `Instance name "${name}" is already used`)
    }
    await writeJson(this.recordPath(id), { ...record, name })
    this.emit()
  }

  async remove(id: string): Promise<void> {
    const record = await this.get(id)
    await rm(this.paths.instance(record.id), { recursive: true, force: true })
    this.emit()
  }

  async patch(id: string, patch: Partial<InstanceRecord>): Promise<InstanceRecord> {
    const record = await this.get(id)
    const next = instanceRecordSchema.parse({ ...record, ...patch, id: record.id })
    await writeJson(this.recordPath(id), next)
    this.emit()
    return next
  }

  /** Records the version id produced by the installer and the last launch time. */
  async markInstalled(id: string, resolvedVersionId: string): Promise<void> {
    await this.patch(id, { resolvedVersionId })
  }

  async markPlayed(id: string): Promise<void> {
    await this.patch(id, { lastPlayedAt: new Date().toISOString() })
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  private async read(id: string): Promise<InstanceRecord | null> {
    let path: string
    try {
      path = this.recordPath(id)
    } catch {
      return null
    }
    return readJsonIfExists(path, (raw) => instanceRecordSchema.parse(raw))
  }

  private async toSummary(record: InstanceRecord): Promise<InstanceSummary> {
    const installed = record.resolvedVersionId
      ? await exists(join(this.paths.versions, record.resolvedVersionId, `${record.resolvedVersionId}.json`))
      : false
    return {
      id: record.id,
      name: record.name,
      mcVersion: record.mcVersion,
      loader: record.loader,
      loaderVersion: record.loaderVersion,
      resolvedVersionId: record.resolvedVersionId,
      installed,
      createdAt: record.createdAt,
      lastPlayedAt: record.lastPlayedAt,
      memoryMb: record.memoryMb,
      javaPath: record.javaPath,
      jvmArgs: record.jvmArgs
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
