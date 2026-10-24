import { describe, expect, it } from 'vitest'
import { isInside, assertSafeSegment, gamePaths } from '@main/core/paths'
import { offlineUuid, isValidOfflineName } from '@main/core/auth/offline'
import { compareVersionsDesc, isLegacyMinecraft, neoforgePrefix } from '@main/core/minecraft/loaders'
import { scrubSecrets } from '@shared/errors'
import { formatBytes, formatDuration, translate, errorMessageKey } from '@renderer/i18n/index'
import { en, zhCN } from '@renderer/i18n/messages'

describe('paths', () => {
  it('keeps children inside their parent', () => {
    expect(isInside('C:/game', 'C:/game/instances/a')).toBe(true)
    expect(isInside('C:/game', 'C:/game')).toBe(true)
    expect(isInside('C:/game', 'C:/other/a')).toBe(false)
    expect(isInside('C:/game', 'C:/game/../escape')).toBe(false)
  })

  it('rejects path segments that could escape', () => {
    expect(assertSafeSegment('abc-123', 'id')).toBe('abc-123')
    expect(() => assertSafeSegment('..', 'id')).toThrow()
    expect(() => assertSafeSegment('a/b', 'id')).toThrow()
    expect(() => assertSafeSegment('a\\b', 'id')).toThrow()
    expect(() => assertSafeSegment('', 'id')).toThrow()
  })

  it('derives the standard game layout', () => {
    const paths = gamePaths('C:/game')
    expect(paths.versions.endsWith('versions')).toBe(true)
    expect(paths.instance('x')).toContain('instances')
  })
})

describe('offline profiles', () => {
  it('matches Java OfflinePlayer UUIDs', () => {
    expect(offlineUuid('Tester')).toBe('f3d28cb0-7225-3cb1-baeb-2dadd2be89ae')
    expect(offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f')
    expect(offlineUuid('Tester')).toBe(offlineUuid('Tester'))
  })

  it('validates the vanilla username shape', () => {
    expect(isValidOfflineName('Tester')).toBe(true)
    expect(isValidOfflineName('a_1')).toBe(true)
    expect(isValidOfflineName('ab')).toBe(false)
    expect(isValidOfflineName('with space')).toBe(false)
    expect(isValidOfflineName('x'.repeat(17))).toBe(false)
  })
})

describe('loader helpers', () => {
  it('orders versions numerically', () => {
    expect(compareVersionsDesc('1.2.10', '1.2.9')).toBeLessThan(0)
    expect(compareVersionsDesc('1.2.9', '1.2.10')).toBeGreaterThan(0)
    expect(compareVersionsDesc('1.2', '1.2.0')).toBe(0)
  })

  it('maps Minecraft lines to NeoForge prefixes', () => {
    expect(neoforgePrefix('1.21.1')).toBe('21.1')
    expect(neoforgePrefix('1.20.2')).toBe('20.2')
    expect(neoforgePrefix('26.3')).toBe('26.3')
  })

  it('flags only pre-1.13 classic versions as legacy', () => {
    expect(isLegacyMinecraft('1.12.2')).toBe(true)
    expect(isLegacyMinecraft('1.13')).toBe(false)
    expect(isLegacyMinecraft('26.3')).toBe(false)
  })
})

describe('secret scrubbing', () => {
  it('removes tokens from launch arguments and json', () => {
    expect(scrubSecrets('--accessToken abc.def-123 --uuid 1')).toBe('--accessToken <redacted> --uuid 1')
    expect(scrubSecrets('{"accessToken":"secret"}')).toBe('{"accessToken":"<redacted>"}')
    expect(scrubSecrets('Authorization: Bearer eyJhbGciOi.payload')).toContain('<redacted>')
  })
})

describe('i18n', () => {
  it('ships identical key sets for both languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zhCN).sort())
  })

  it('interpolates parameters and falls back to the key', () => {
    expect(translate('zh-CN', 'install.label.loader', { loader: 'Fabric' })).toBe('安装 Fabric')
    expect(translate('en', 'status.elapsed', { time: '1:05' })).toBe('Running for 1:05')
    expect(translate('en', 'error.generic')).toBe('Something went wrong')
  })

  it('maps every error code to a message key', () => {
    expect(errorMessageKey('auth.no-minecraft')).toBe('error.auth.no-minecraft')
    expect(errorMessageKey('nonsense')).toBe('error.generic')
  })

  it('formats bytes and durations', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024 * 3)).toBe('3.0 MB')
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
  })
})
