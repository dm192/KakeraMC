import type { JSX } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useStore } from '../state/store'
import { useI18n } from '../i18n/useI18n'
import { Button } from './Button'

export interface AccountMenuProps {
  onManage: () => void
}

export function AccountMenu({ onManage }: AccountMenuProps): JSX.Element {
  const { t } = useI18n()
  const accounts = useStore((state) => state.accounts)
  const selectAccount = useStore((state) => state.selectAccount)

  const current = accounts?.accounts.find((account) => account.id === accounts.selectedId) ?? null

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" aria-label={t('account.menu.manage')}>
          {current ? current.name : t('account.menu.none')}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align="end" sideOffset={6}>
          <DropdownMenu.RadioGroup
            value={accounts?.selectedId ?? ''}
            onValueChange={(value) => void selectAccount(value)}
          >
            {(accounts?.accounts ?? []).map((account) => (
              <DropdownMenu.RadioItem key={account.id} value={account.id} className="menu__item">
                {account.name}
                {account.type === 'offline' ? ` · ${t('accounts.offline')}` : ''}
                {account.needsReauth ? ` · ${t('accounts.needsReauth')}` : ''}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          {(accounts?.accounts.length ?? 0) > 0 ? <DropdownMenu.Separator /> : null}
          <DropdownMenu.Item className="menu__item menu__item--muted" onSelect={onManage}>
            {t('account.menu.manage')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
