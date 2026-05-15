type Props = {
  title: string
}

export function PlaceholderPage({ title }: Props) {
  return (
    <div className="page">
      <div className="pageHeader">
        <div className="pageTitle">{title}</div>
        <div className="pageSub">Раздел в разработке</div>
      </div>
    </div>
  )
}
