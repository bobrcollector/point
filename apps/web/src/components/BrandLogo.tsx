type Props = {
  className?: string
  title?: string
}

/** Логотип Point для тёмного сайдбара (белая версия favicon). */
export function BrandLogo({ className, title = 'Point' }: Props) {
  return (
    <img
      src="/favicon.svg"
      alt={title}
      className={['brandLogo', className].filter(Boolean).join(' ')}
      width={32}
      height={30}
      decoding="async"
    />
  )
}
