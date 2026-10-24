import { useState } from 'react'
import type { JSX } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useStore } from '../state/store'
import { BannerView, InfoBanner } from '../components/Banner'
import { Button } from '../components/Button'
import { OfflineAccountDialog } from '../components/OfflineAccountDialog'

export function AccountsView(): JSX.Element {
  const { t } = useI18n()
  const accounts = useStore((state) => state.accounts)
  const banner = useStore((state) => state.banner)
  const dismissBanner = useStore((state) => state.dismissBanner)
  const addMicrosoft = useStore((state) => state.addMicrosoft)
  const selectAccount = useStore((state) => state.selectAccount)
  const removeAccount = useStore((state) => state.removeAccount)
  const cancelAuth = useStore((state) => state.cancelAuth)
  const [offlineOpen, setOfflineOpen] = useState(false)
  const [signingIn, setSigningIn] = useState(false)

  const list = accounts?.accounts ?? []
  const prompt = accounts?.auth ?? null

  const startMicrosoft = async (): Promise<void> => {
    setSigningIn(true)
    try {
      await addMicrosoft()
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <section className="main">
      <header className="main__head">
        <div className="main__identity">
          <h1 className="main__title">{t('accounts.title')}</h1>
        </div>
        <div className="main__actions">
          <Button variant="ghost" onClick={() => setOfflineOpen(true)}>
            {t('accounts.add.offline')}
          </Button>
          <Button variant="primary" onClick={() => void startMicrosoft()} disabled={signingIn}>
            {t('accounts.add.microsoft')}
          </Button>
        </div>
      </header>

      <div className="main__body">
        {banner ? <BannerView banner={banner} onDismiss={dismissBanner} /> : null}
        {accounts && !accounts.vaultPersistent ? <InfoBanner>{t('accounts.vaultWarning')}</InfoBanner> : null}

        {prompt ? (
          <div className="banner" role="status">
            <div className="banner__body">
              <span className="banner__title">{t('accounts.add.microsoft')}</span>
              <span className="banner__detail">
                {prompt.kind === 'browser'
                  ? t('accounts.auth.browser')
                  : t('accounts.auth.deviceCode', { url: prompt.verificationUri, code: prompt.userCode })}
              </span>
            </div>
            <div className="banner__actions">
              <Button variant="ghost" onClick={() => void cancelAuth()}>
                {t('accounts.auth.cancel')}
              </Button>
            </div>
          </div>
        ) : null}

        {list.length === 0 ? (
          <div className="empty">
            <p className="empty__title">{t('accounts.empty.title')}</p>
            <p className="empty__hint">{t('accounts.empty.hint')}</p>
          </div>
        ) : (
          <div className="accounts">
            {list.map((account) => {
              const selected = account.id === accounts?.selectedId
              return (
                <div key={account.id} className="account" data-selected={selected}>
                  <div className="banner__body">
                    <span className="account__name">{account.name}</span>
                    <span className="account__meta">
                      {account.type === 'microsoft' ? t('accounts.microsoft') : t('accounts.offline')} ·{' '}
                      {account.uuid.slice(0, 8)}
                    </span>
                  </div>
                  {selected ? <span className="account__tag">{t('accounts.current')}</span> : null}
                  {account.needsReauth ? <span className="account__tag">{t('accounts.needsReauth')}</span> : null}
                  <div className="account__actions">
                    {!selected ? (
                      <Button variant="ghost" onClick={() => void selectAccount(account.id)}>
                        {t('common.use')}
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={() => void removeAccount(account.id)}>
                      {t('common.remove')}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {list.some((account) => account.type === 'offline') ? (
          <p className="field__hint">{t('accounts.offlineNote')}</p>
        ) : null}
      </div>

      <OfflineAccountDialog open={offlineOpen} onOpenChange={setOfflineOpen} />
    </section>
  )
}
