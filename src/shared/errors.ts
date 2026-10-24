import type { AppError, AppErrorCode } from './types'

/** Error carrying a stable code so the renderer can localize the message. */
export class KakeraError extends Error {
  readonly code: AppErrorCode
  readonly detail: string | undefined

  constructor(code: AppErrorCode, message: string, detail?: string) {
    super(message)
    this.name = 'KakeraError'
    this.code = code
    this.detail = detail
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof KakeraError) {
    return error.detail === undefined
      ? { code: error.code, message: error.message }
      : { code: error.code, message: error.message, detail: error.detail }
  }
  if (error instanceof Error) {
    return { code: 'generic', message: error.message }
  }
  return { code: 'generic', message: String(error) }
}

/** Network/FS failures keep the original message but never leak tokens. */
export function scrubSecrets(text: string): string {
  return text
    .replace(/("accessToken"\s*:\s*")[^"]+(")/gi, '$1<redacted>$2')
    .replace(/(--accessToken\s+)\S+/gi, '$1<redacted>')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/g, '$1<redacted>')
}
