import { useState } from 'react'
import type { FormEvent, JSX } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { InstanceSummary } from '@shared/types'
import { useStore } from '../state/store'
import { useI18n } from '../i18n/useI18n'
import { Button } from './Button'

export interface InstanceMenuProps {
  instance: InstanceSummary
}

/** Destructive instance management lives behind an explicit menu. */
export function InstanceMenu({ instance }: InstanceMenuProps): JSX.Element {
  const { t } = useI18n()
  const renameInstance = useStore((state) => state.renameInstance)
  const deleteInstance = useStore((state) => state.deleteInstance)

  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState(instance.name)
  const [error, setError] = useState<string | null>(null)

  const submitRename = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('create.nameRequired'))
      return
    }
    const ok = await renameInstance(instance.id, trimmed)
    if (ok) {
      setRenameOpen(false)
      setError(null)
    }
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" iconOnly aria-label={t('instance.menu.aria')} title={t('instance.menu.aria')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu" align="end" sideOffset={6}>
            <DropdownMenu.Item
              className="menu__item"
              onSelect={() => {
                setName(instance.name)
                setRenameOpen(true)
              }}
            >
              {t('instance.menu.rename')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="menu__item"
              onSelect={() => {
                setDeleteOpen(true)
              }}
            >
              {t('instance.menu.delete')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={renameOpen} onOpenChange={setRenameOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog" aria-describedby={undefined}>
            <Dialog.Title className="dialog__title">{t('instance.rename.title')}</Dialog.Title>
            <form className="dialog__body" onSubmit={submitRename}>
              <div className="field">
                <label className="field__label" htmlFor="rename-instance">
                  {t('create.name')}
                </label>
                <input
                  id="rename-instance"
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={48}
                  autoFocus
                />
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
                <Button type="submit" variant="primary">
                  {t('common.save')}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog" aria-describedby={undefined}>
            <Dialog.Title className="dialog__title">{t('instance.delete.title')}</Dialog.Title>
            <div className="dialog__body">
              <p className="field__hint">{t('instance.delete.body', { name: instance.name })}</p>
              <div className="dialog__actions">
                <Dialog.Close asChild>
                  <Button variant="ghost">{t('common.cancel')}</Button>
                </Dialog.Close>
                <Button
                  variant="danger"
                  onClick={() => {
                    setDeleteOpen(false)
                    void deleteInstance(instance.id)
                  }}
                >
                  {t('instance.menu.delete')}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
