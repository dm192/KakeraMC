import type { JSX } from 'react'
import type { TaskSnapshot } from '@shared/types'
import { formatBytes, translate } from '../i18n'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { Button } from './Button'

export interface TaskProgressProps {
  task: TaskSnapshot
  onCancel?: () => void
}

/**
 * Real progress only: byte totals come from the files being transferred, and
 * an unknown total renders as an indeterminate state instead of a fake percent.
 */
export function TaskProgress({ task, onCancel }: TaskProgressProps): JSX.Element {
  const { language, t } = useI18n()
  const progress = task.progress
  const hasTotal = progress !== null && progress.total > 0
  const percent = hasTotal ? Math.min(100, Math.round(((progress?.done ?? 0) / (progress?.total ?? 1)) * 100)) : null
  const label = translate(language, task.labelKey as MessageKey, task.labelParams)

  const detail = (() => {
    if (!progress) return t('progress.indeterminate')
    if (progress.unit === 'bytes') {
      return `${formatBytes(progress.done)} / ${formatBytes(progress.total)}`
    }
    return `${progress.done} / ${progress.total}`
  })()

  return (
    <div>
      <div
        className="progress"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
      >
        <div
          className={percent === null ? 'progress__bar progress__bar--indeterminate' : 'progress__bar'}
          style={{ width: percent === null ? '28%' : `${percent}%` }}
        />
      </div>
      <div className="progress__meta">
        <span>{label}</span>
        <span>
          {detail}
          {percent === null ? '' : ` · ${percent}%`}
        </span>
      </div>
      {onCancel ? (
        <div className="form__actions">
          <Button variant="ghost" onClick={onCancel}>
            {t('action.cancel')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
