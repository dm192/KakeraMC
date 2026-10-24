import { useState } from 'react'
import type { FormEvent, JSX } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useStore } from '../state/store'
import { useI18n } from '../i18n/useI18n'
import { Button } from './Button'

export interface OfflineAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OfflineAccountDialog({ open, onOpenChange }: OfflineAccountDialogProps): JSX.Element {
  const { t } = useI18n()
  const addOffline = useStore((state) => state.addOffline)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(trimmed)) {
      setError(t('error.account.name-invalid'))
      return
    }
    setSubmitting(true)
    const ok = await addOffline(trimmed)
    setSubmitting(false)
    if (ok) {
      setName('')
      setError(null)
      onOpenChange(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog" aria-describedby={undefined}>
          <Dialog.Title className="dialog__title">{t('offline.title')}</Dialog.Title>
          <form className="dialog__body" onSubmit={submit}>
            <div className="field">
              <label className="field__label" htmlFor="offline-name">
                {t('offline.name')}
              </label>
              <input
                id="offline-name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                maxLength={16}
                autoComplete="off"
              />
              <span className="field__hint">{t('offline.hint')}</span>
              {error ? (
                <span className="field__hint" style={{ color: 'var(--danger)' }}>
                  {error}
                </span>
              ) : null}
            </div>
            <div className="dialog__actions">
              <Dialog.Close asChild>
                <Button variant="ghost">{t('common.cancel')}</Button>
              </Dialog.Close>
              <Button type="submit" variant="primary" disabled={submitting}>
                {t('offline.submit')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
