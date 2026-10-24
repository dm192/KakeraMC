import type { AppErrorCode, Language } from '@shared/types'
import { en, zhCN } from './messages'
import type { MessageKey } from './messages'

export type { MessageKey }

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = {
  'zh-CN': zhCN,
  en
}

export function translate(
  language: Language,
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  const template = DICTIONARIES[language][key] ?? zhCN[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

const ERROR_KEYS: Record<AppErrorCode, MessageKey> = {
  generic: 'error.generic',
  'settings.invalid': 'error.settings.invalid',
  'instance.not-found': 'error.instance.not-found',
  'instance.invalid': 'error.instance.invalid',
  'instance.name-taken': 'error.instance.name-taken',
  'install.failed': 'error.install.failed',
  'install.canceled': 'error.install.canceled',
  'verify.failed': 'error.verify.failed',
  'launch.java-missing': 'error.launch.java-missing',
  'launch.already-running': 'error.launch.already-running',
  'launch.failed': 'error.launch.failed',
  'launch.no-account': 'error.launch.no-account',
  'launch.instance-not-installed': 'error.launch.instance-not-installed',
  'auth.not-configured': 'error.auth.not-configured',
  'auth.canceled': 'error.auth.canceled',
  'auth.timeout': 'error.auth.timeout',
  'auth.state-mismatch': 'error.auth.state-mismatch',
  'auth.failed': 'error.auth.failed',
  'auth.no-minecraft': 'error.auth.no-minecraft',
  'auth.xbox-blocked': 'error.auth.xbox-blocked',
  'auth.needs-reauth': 'error.auth.needs-reauth',
  'account.not-found': 'error.account.not-found',
  'account.name-invalid': 'error.account.name-invalid',
  'net.failed': 'error.net.failed',
  'version.not-found': 'error.version.not-found',
  'loader.unavailable': 'error.loader.unavailable',
  'loader.unsupported': 'error.loader.unsupported'
}

export function errorMessageKey(code: string): MessageKey {
  return ERROR_KEYS[code as AppErrorCode] ?? 'error.generic'
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  const value = bytes / 1024 ** exponent
  const digits = value >= 100 || exponent === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${BYTE_UNITS[exponent]}`
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}
