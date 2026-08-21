/** 将相对或绝对 URL 解析为基于原文 URL 的绝对地址。 */
export function resolveUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href
  } catch {
    return url
  }
}

/** 将正文内所有 `<a>` 链接的 href 转换为绝对地址。 */
export function normalizeLinks(root: HTMLElement, baseUrl: string): void {
  root.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href')
    if (href) {
      anchor.setAttribute('href', resolveUrl(href, baseUrl))
    }
  })
}
