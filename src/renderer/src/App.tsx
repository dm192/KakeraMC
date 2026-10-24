import { useEffect } from 'react'
import type { JSX } from 'react'
import { useI18n } from './i18n/useI18n'
import { useStore } from './state/store'
import type { View } from './state/store'
import { AccountsView } from './views/AccountsView'
import { InstancesView } from './views/InstancesView'
import { SettingsView } from './views/SettingsView'

const NAV: Array<{ view: View; labelKey: 'rail.instances' | 'rail.accounts' | 'rail.settings'; path: string }> = [
  { view: 'instances', labelKey: 'rail.instances', path: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
  { view: 'accounts', labelKey: 'rail.accounts', path: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0' },
  {
    view: 'settings',
    labelKey: 'rail.settings',
    path: 'M4 7h10M18 7h2M4 12h4M12 12h8M4 17h9M17 17h3M14 5v4M8 10v4M13 15v4'
  }
]

export function App(): JSX.Element {
  const { language, t } = useI18n()
  const view = useStore((state) => state.view)
  const setView = useStore((state) => state.setView)
  const ready = useStore((state) => state.ready)
  const bootError = useStore((state) => state.bootError)
  const init = useStore((state) => state.init)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  if (!ready) {
    return (
      <div className="app" data-view="instances">
        <main className="main">
          <div className="empty">
            <p className="empty__hint" role="status">
              {t('common.loading')}
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (bootError) {
    return (
      <div className="app" data-view="instances">
        <main className="main">
          <div className="empty">
            <p className="empty__title">{t('error.generic')}</p>
            <p className="empty__hint">{bootError.message}</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app" data-view={view}>
      <nav className="rail" aria-label={t('rail.instances')}>
        <div className="rail__brand" aria-hidden="true">
          <ShardMark />
        </div>
        <div className="rail__divider" aria-hidden="true" />
        {NAV.map((item) => (
          <button
            key={item.view}
            type="button"
            className="rail__item"
            aria-current={view === item.view ? 'page' : undefined}
            aria-label={t(item.labelKey)}
            title={t(item.labelKey)}
            onClick={() => setView(item.view)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={item.path} />
            </svg>
          </button>
        ))}
      </nav>

      {view === 'instances' ? <InstancesView onManageAccounts={() => setView('accounts')} /> : null}
      {view === 'accounts' ? <AccountsView /> : null}
      {view === 'settings' ? <SettingsView /> : null}
    </div>
  )
}

function ShardMark(): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.5 20 9l-3.5 12h-9L4 9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 9h16M12 2.5 8.5 21M12 2.5 15.5 21" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" opacity="0.55" />
    </svg>
  )
}
