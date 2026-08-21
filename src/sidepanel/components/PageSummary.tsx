interface PageSummaryProps {
  title: string
  domain: string
}

/** 当前网页摘要：展示标题和域名。 */
export function PageSummary({ title, domain }: PageSummaryProps) {
  return (
    <section className="page-summary" aria-label="当前网页">
      <span className="page-summary__label">当前网页</span>
      <h2 className="page-summary__title">{title}</h2>
      <span className="page-summary__domain">{domain}</span>
    </section>
  )
}
