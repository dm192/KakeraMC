import type { JSX, ReactNode } from 'react'
import type { Banner } from '../state/store'
import { errorMessageKey } from '../i18n'
import { useI18n } from '../i18n/useI18n'
import { Button } from './Button'

export interface BannerViewProps {
  banner: Banner
  onDismiss?: () => void
  action?: { label: string; onClick: () => void }
}

/** One failure surface: localized cause, technical detail, explicit retry. */
export function BannerView({ banner, onDismiss, action }: BannerViewProps): JSX.Element {
  const { t } = useI18n()
  return (
    <div className="banner banner--error" role="alert">
      <div className="banner__body">
        <span className="banner__title">{t(errorMessageKey(banner.code))}</span>
        {banner.message ? <span className="banner__detail">{banner.message}</span> : null}
        {banner.detail ? <span className="banner__detail">{banner.detail}</span> : null}
      </div>
      <div className="banner__actions">
        {action ? (
          <Button onClick={action.onClick} variant="ghost">
            {action.label}
          </Button>
        ) : null}
        {onDismiss ? (
          <Button onClick={onDismiss} variant="ghost">
            {t('common.close')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function InfoBanner({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="banner">
      <div className="banner__body">
        <span className="banner__detail">{children}</span>
      </div>
    </div>
  )
}
