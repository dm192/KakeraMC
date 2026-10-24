import type { ButtonHTMLAttributes, JSX } from 'react'
import { cx } from '../i18n/useI18n'

type Variant = 'default' | 'primary' | 'danger' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  iconOnly?: boolean
}

export function Button({
  variant = 'default',
  iconOnly = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cx('btn', variant !== 'default' && `btn--${variant}`, iconOnly && 'btn--icon', className)}
      {...rest}
    />
  )
}
