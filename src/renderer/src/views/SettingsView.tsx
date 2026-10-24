import { useEffect, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import type { Language, Settings, SettingsPatch } from '@shared/types'
import { useI18n } from '../i18n/useI18n'
import { useStore } from '../state/store'
import { BannerView } from '../components/Banner'
import { Button } from '../components/Button'

interface Draft {
  gameRoot: string
  language: Language
  javaPath: string
  memoryMb: string
  jvmArgs: string
  downloadConcurrency: string
  microsoftClientId: string
}

function toDraft(settings: Settings): Draft {
  return {
    gameRoot: settings.gameRoot,
    language: settings.language,
    javaPath: settings.javaPath ?? '',
    memoryMb: String(settings.memoryMb),
    jvmArgs: settings.jvmArgs.join('\n'),
    downloadConcurrency: String(settings.downloadConcurrency),
    microsoftClientId: settings.microsoftClientId ?? ''
  }
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (Object.keys(a) as Array<keyof Draft>).every((key) => a[key] === b[key])
}

export function SettingsView(): JSX.Element {
  const { t } = useI18n()
  const settings = useStore((state) => state.settings)
  const info = useStore((state) => state.info)
  const banner = useStore((state) => state.banner)
  const dismissBanner = useStore((state) => state.dismissBanner)
  const saveSettings = useStore((state) => state.saveSettings)

  const [draft, setDraft] = useState<Draft | null>(settings ? toDraft(settings) : null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings) setDraft(toDraft(settings))
  }, [settings])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [saved])

  if (!settings || !draft) return <section className="main" />

  const memory = Number(draft.memoryMb)
  const concurrency = Number(draft.downloadConcurrency)
  const memoryValid = Number.isFinite(memory) && memory >= 512 && memory <= 65536
  const concurrencyValid = Number.isFinite(concurrency) && concurrency >= 1 && concurrency <= 32
  const dirty = !sameDraft(toDraft(settings), draft)
  const canSave = dirty && memoryValid && concurrencyValid && draft.gameRoot.trim().length > 0

  const update = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    setSaved(false)
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!canSave) return
    const patch: SettingsPatch = {
      gameRoot: draft.gameRoot.trim(),
      language: draft.language,
      javaPath: draft.javaPath.trim() ? draft.javaPath.trim() : null,
      memoryMb: memory,
      jvmArgs: draft.jvmArgs
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
      downloadConcurrency: concurrency,
      microsoftClientId: draft.microsoftClientId.trim() ? draft.microsoftClientId.trim() : null
    }
    const ok = await saveSettings(patch)
    if (ok) setSaved(true)
  }

  return (
    <section className="main">
      <header className="main__head">
        <div className="main__identity">
          <h1 className="main__title">{t('settings.title')}</h1>
        </div>
      </header>

      <div className="main__body">
        {banner ? <BannerView banner={banner} onDismiss={dismissBanner} /> : null}
        {info?.fakeBackend ? <p className="field__hint">{t('settings.fakeBackend')}</p> : null}

        <form className="settings" onSubmit={submit}>
          <section className="settings__section">
            <h2 className="settings__heading">{t('settings.general')}</h2>
            <div className="field">
              <label className="field__label" htmlFor="settings-game-root">
                {t('settings.gameRoot')}
              </label>
              <input
                id="settings-game-root"
                className="input"
                value={draft.gameRoot}
                onChange={(event) => update('gameRoot', event.target.value)}
                spellCheck={false}
              />
              <span className="field__hint">{t('settings.gameRootHint')}</span>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="settings-language">
                {t('settings.language')}
              </label>
              <select
                id="settings-language"
                className="select"
                value={draft.language}
                onChange={(event) => update('language', event.target.value as Language)}
              >
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </section>

          <section className="settings__section">
            <h2 className="settings__heading">{t('settings.java')}</h2>
            <div className="field">
              <label className="field__label" htmlFor="settings-java">
                {t('settings.javaPath')}
              </label>
              <input
                id="settings-java"
                className="input"
                value={draft.javaPath}
                onChange={(event) => update('javaPath', event.target.value)}
                placeholder="C:\\Program Files\\Java\\bin\\java.exe"
                spellCheck={false}
              />
              <span className="field__hint">{t('settings.javaPathHint')}</span>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="settings-memory">
                {t('settings.memory')}
              </label>
              <input
                id="settings-memory"
                className="input"
                type="number"
                min={512}
                max={65536}
                step={256}
                value={draft.memoryMb}
                onChange={(event) => update('memoryMb', event.target.value)}
                aria-invalid={!memoryValid}
              />
              <span className="field__hint">{t('settings.memoryHint')}</span>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="settings-jvm-args">
                {t('settings.jvmArgs')}
              </label>
              <textarea
                id="settings-jvm-args"
                className="textarea"
                value={draft.jvmArgs}
                onChange={(event) => update('jvmArgs', event.target.value)}
                spellCheck={false}
              />
              <span className="field__hint">{t('settings.jvmArgsHint')}</span>
            </div>
          </section>

          <section className="settings__section">
            <h2 className="settings__heading">{t('settings.network')}</h2>
            <div className="field">
              <label className="field__label" htmlFor="settings-concurrency">
                {t('settings.concurrency')}
              </label>
              <input
                id="settings-concurrency"
                className="input"
                type="number"
                min={1}
                max={32}
                value={draft.downloadConcurrency}
                onChange={(event) => update('downloadConcurrency', event.target.value)}
                aria-invalid={!concurrencyValid}
              />
            </div>
          </section>

          <section className="settings__section">
            <h2 className="settings__heading">{t('settings.microsoft')}</h2>
            <div className="field">
              <label className="field__label" htmlFor="settings-client-id">
                {t('settings.clientId')}
              </label>
              <input
                id="settings-client-id"
                className="input"
                value={draft.microsoftClientId}
                onChange={(event) => update('microsoftClientId', event.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <span className="field__hint">{t('settings.clientIdHint')}</span>
            </div>
          </section>

          <div className="form__actions form__actions--sticky">
            <Button type="submit" variant="primary" disabled={!canSave}>
              {t('settings.save')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(toDraft(settings))
                setSaved(false)
              }}
              disabled={!dirty}
            >
              {t('settings.reset')}
            </Button>
            <span className="field__hint" aria-live="polite">
              {saved ? t('settings.saved') : ''}
            </span>
          </div>
        </form>

        <section className="settings__section">
          <h2 className="settings__heading">{t('settings.about')}</h2>
          <div className="about">
            <span>
              {t('settings.about.launcher')}: {info?.appVersion ?? '—'}
            </span>
            <span>
              {t('settings.about.electron')}: {info?.electron ?? '—'} · {info?.platform ?? ''} {info?.arch ?? ''}
            </span>
            <span>
              {t('settings.about.data')}: {info?.userDataDir ?? '—'}
            </span>
            <span>
              {t('settings.about.game')}: {settings.gameRoot}
            </span>
          </div>
        </section>
      </div>
    </section>
  )
}
