import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { LoaderOption, LoaderType, VersionOption } from '@shared/types'
import { useStore } from '../state/store'
import { api } from '../api'
import { useI18n } from '../i18n/useI18n'
import type { MessageKey } from '../i18n/messages'
import { Button } from './Button'

const LOADERS: LoaderType[] = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge']

export interface CreateInstanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateInstanceDialog({ open, onOpenChange }: CreateInstanceDialogProps): JSX.Element {
  const { t } = useI18n()
  const createInstance = useStore((state) => state.createInstance)

  const [name, setName] = useState('')
  const [mcVersion, setMcVersion] = useState('')
  const [loader, setLoader] = useState<LoaderType>('vanilla')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [versions, setVersions] = useState<VersionOption[]>([])
  const [versionsError, setVersionsError] = useState(false)
  const [showOlder, setShowOlder] = useState(false)
  const [loaderVersions, setLoaderVersions] = useState<LoaderOption[]>([])
  const [loaderError, setLoaderError] = useState<string | null>(null)
  const [loadingLoaders, setLoadingLoaders] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setFormError(null)
    api
      .listMinecraftVersions()
      .then((list) => {
        if (cancelled) return
        setVersions(list)
        setVersionsError(false)
        setMcVersion((current) => current || (list.find((version) => version.type === 'release')?.id ?? ''))
      })
      .catch(() => {
        if (!cancelled) setVersionsError(true)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const versionChoices = useMemo(() => {
    const releases = versions.filter((version) => version.type === 'release')
    if (showOlder) return versions
    return releases.length > 0 ? releases : versions
  }, [versions, showOlder])

  useEffect(() => {
    if (!open || !mcVersion || loader === 'vanilla') {
      setLoaderVersions([])
      setLoaderVersion('')
      setLoaderError(null)
      return
    }
    let cancelled = false
    setLoadingLoaders(true)
    setLoaderError(null)
    setLoaderVersions([])
    setLoaderVersion('')
    api
      .listLoaderVersions({ mcVersion, loader })
      .then((list) => {
        if (cancelled) return
        setLoaderVersions(list)
        setLoaderVersion(list[0]?.version ?? '')
        setLoaderError(list.length === 0 ? 'empty' : null)
      })
      .catch(() => {
        if (!cancelled) setLoaderError('failed')
      })
      .finally(() => {
        if (!cancelled) setLoadingLoaders(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, mcVersion, loader])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!name.trim()) {
      setFormError(t('create.nameRequired'))
      return
    }
    if (!mcVersion) {
      setFormError(t('create.versionRequired'))
      return
    }
    setSubmitting(true)
    const ok = await createInstance({
      name: name.trim(),
      mcVersion,
      loader,
      ...(loader !== 'vanilla' && loaderVersion ? { loaderVersion } : {})
    })
    setSubmitting(false)
    if (ok) {
      onOpenChange(false)
      setName('')
      setLoader('vanilla')
      setLoaderVersion('')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog" aria-describedby={undefined}>
          <Dialog.Title className="dialog__title">{t('create.title')}</Dialog.Title>
          <form onSubmit={submit} className="dialog__body">
            <div className="field">
              <label className="field__label" htmlFor="create-name">
                {t('create.name')}
              </label>
              <input
                id="create-name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('create.namePlaceholder')}
                autoFocus
                maxLength={48}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="create-version">
                {t('create.version')}
              </label>
              <select
                id="create-version"
                className="select"
                value={mcVersion}
                onChange={(event) => setMcVersion(event.target.value)}
                disabled={versions.length === 0}
              >
                {versions.length === 0 ? (
                  <option value="">{versionsError ? t('create.versionsError') : t('create.versionsLoading')}</option>
                ) : null}
                {versionChoices.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.id}
                    {version.type === 'release' ? '' : ` (${version.type})`}
                  </option>
                ))}
              </select>
              {versions.length > 0 ? (
                <label className="field__hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={showOlder}
                    onChange={(event) => setShowOlder(event.target.checked)}
                  />
                  <span>{showOlder ? t('create.hideOlder') : t('create.showOlder')}</span>
                </label>
              ) : null}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="create-loader">
                {t('create.loader')}
              </label>
              <select
                id="create-loader"
                className="select"
                value={loader}
                onChange={(event) => setLoader(event.target.value as LoaderType)}
              >
                {LOADERS.map((value) => (
                  <option key={value} value={value}>
                    {t(`loader.${value}` as MessageKey)}
                  </option>
                ))}
              </select>
            </div>

            {loader !== 'vanilla' ? (
              <div className="field">
                <label className="field__label" htmlFor="create-loader-version">
                  {t('create.loaderVersion')}
                </label>
                <select
                  id="create-loader-version"
                  className="select"
                  value={loaderVersion}
                  onChange={(event) => setLoaderVersion(event.target.value)}
                  disabled={loadingLoaders || loaderVersions.length === 0}
                >
                  {loadingLoaders ? <option value="">{t('create.loaderVersion.loading')}</option> : null}
                  {!loadingLoaders && loaderVersions.length === 0 ? (
                    <option value="">{t('create.loaderVersion.none')}</option>
                  ) : null}
                  {loaderVersions.map((option) => (
                    <option key={option.version} value={option.version}>
                      {option.version}
                      {option.stable ? '' : ' (beta)'}
                    </option>
                  ))}
                </select>
                {loaderError === 'failed' ? <span className="field__hint">{t('create.versionsError')}</span> : null}
              </div>
            ) : null}

            {formError ? <span className="field__hint" style={{ color: 'var(--danger)' }}>{formError}</span> : null}

            <div className="dialog__actions">
              <Dialog.Close asChild>
                <Button variant="ghost">{t('common.cancel')}</Button>
              </Dialog.Close>
              <Button type="submit" variant="primary" disabled={submitting}>
                {t('create.submit')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
