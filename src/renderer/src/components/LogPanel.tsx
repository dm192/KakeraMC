import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import type { LogLine } from '@shared/types'
import { useI18n } from '../i18n/useI18n'
import { Button } from './Button'

export interface LogPanelProps {
  lines: LogLine[]
  open: boolean
  onToggle: () => void
  onOpenFolder?: () => void
}

export function LogPanel({ lines, open, onToggle, onOpenFolder }: LogPanelProps): JSX.Element {
  const { t } = useI18n()
  const scroller = useRef<HTMLPreElement | null>(null)

  useEffect(() => {
    if (!open) return
    const node = scroller.current
    if (node) node.scrollTop = node.scrollHeight
  }, [lines, open])

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="panel__title">{t('log.title')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {onOpenFolder ? (
            <Button variant="ghost" onClick={onOpenFolder}>
              {t('action.openLogs')}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onToggle} aria-expanded={open}>
            {open ? t('log.hide') : t('log.show')}
          </Button>
        </div>
      </div>
      {open ? (
        lines.length === 0 ? (
          <p className="log__empty">{t('log.empty')}</p>
        ) : (
          <pre className="log" ref={scroller} aria-live="polite">
            {lines.map((line) => (
              <span key={line.seq} className={`log__line log__line--${line.stream}`}>
                {line.text}
                {'\n'}
              </span>
            ))}
          </pre>
        )
      ) : null}
    </section>
  )
}
