/** 从 URL 提取域名；无法解析时返回空字符串。 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
