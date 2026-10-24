import { isAbsolute, join, relative, resolve, sep } from 'node:path'

/** Where a game root keeps everything Mojang/xmcl expects. */
export interface GamePaths {
  root: string
  versions: string
  libraries: string
  assets: string
  runtime: string
  instances: string
  instance: (id: string) => string
  instanceMods: (id: string) => string
  instanceLogs: (id: string) => string
}

export function gamePaths(root: string): GamePaths {
  const resolved = resolve(root)
  return {
    root: resolved,
    versions: join(resolved, 'versions'),
    libraries: join(resolved, 'libraries'),
    assets: join(resolved, 'assets'),
    runtime: join(resolved, 'runtime'),
    instances: join(resolved, 'instances'),
    instance: (id) => join(resolved, 'instances', id),
    instanceMods: (id) => join(resolved, 'instances', id, 'mods'),
    instanceLogs: (id) => join(resolved, 'instances', id, 'logs')
  }
}

/** True when `child` is `parent` itself or lives underneath it. */
export function isInside(parent: string, child: string): boolean {
  const base = resolve(parent)
  const target = resolve(child)
  if (base === target) return true
  const rel = relative(base, target)
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..')
}

/** Rejects an instance id that could escape the instances directory. */
export function assertSafeSegment(value: string, label: string): string {
  if (!value || value === '.' || value === '..' || /[\\/:*?"<>|\0]/.test(value)) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`)
  }
  return value
}
