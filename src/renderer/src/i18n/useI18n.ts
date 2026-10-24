import { useMemo } from 'react'
import { useStore } from '../state/store'
import { translate } from './index'
import type { MessageKey } from './messages'

export interface I18n {
  language: 'zh-CN' | 'en'
  t: (key: MessageKey, params?: Record<string, string | number>) => string
}

export function useI18n(): I18n {
  const language = useStore((state) => state.settings?.language ?? 'zh-CN')
  return useMemo(
    () => ({
      language,
      t: (key: MessageKey, params?: Record<string, string | number>) => translate(language, key, params)
    }),
    [language]
  )
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}
