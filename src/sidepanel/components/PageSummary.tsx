interface PageSummaryProps {
  title: string
  domain: string
}

/** 当前网页摘要：展示标题和域名。 */
export function PageSummary({ title, domain }: PageSummaryProps) {
  return (
    <section className="page-summary" aria-label="当前网页">
      <span className="page-summary__label">已识别当前网页</span>
      <span className="page-summary__eyebrow">原文标题</span>
      <h2 className="page-summary__title">{title}</h2>
      {domain && <span className="page-summary__domain">来源网站：{domain}</span>}
    </section>
  )
}
