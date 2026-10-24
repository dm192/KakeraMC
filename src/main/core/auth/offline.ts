import { createHash } from 'node:crypto'

/**
 * Offline UUID, matching Java's `UUID.nameUUIDFromBytes("OfflinePlayer:" + name)`.
 * Only used for profiles that intentionally skip Mojang authentication.
 */
export function offlineUuid(name: string): string {
  const digest = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x30
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80
  const hex = digest.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const OFFLINE_NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

export function isValidOfflineName(name: string): boolean {
  return OFFLINE_NAME_PATTERN.test(name)
}
