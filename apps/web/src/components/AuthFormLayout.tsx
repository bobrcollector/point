import { BrandLogo } from './BrandLogo'

type Props = {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

export function AuthFormLayout({ title, subtitle, children, footer }: Props) {
  return (
    <div className="page authPage">
      <div className="authCard">
        <div className="authBrand">
          <BrandLogo />
        </div>
        <h1 className="authTitle">{title}</h1>
        {subtitle ? <p className="authSub">{subtitle}</p> : null}
        {children}
        {footer}
      </div>
    </div>
  )
}
