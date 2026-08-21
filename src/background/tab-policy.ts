import type { AppErrorCode } from '../shared/errors/app-error'

/** Chrome 内部页、扩展页及其他禁止注入内容脚本的协议。 */
const RESTRICTED_PROTOCOLS = new Set([
  'chrome:',
  'chrome-extension:',
  'chrome-search:',
  'chrome-untrusted:',
  'devtools:',
  'edge:',
  'about:',
  'view-source:',
])

/** 允许注入内容脚本并处理的协议。 */
const INJECTABLE_PROTOCOLS = new Set(['http:', 'https:'])

export interface TabPolicyResult {
  /** 是否允许向该标签页注入内容脚本并处理。 */
  processable: boolean
  /** 不可处理时的领域错误码，可处理时为 null。 */
  reason: AppErrorCode | null
  /** 从 URL 提取的域名；URL 非法或受限时为空字符串。 */
  domain: string
}

/** 从 URL 提取域名；无法解析时返回空字符串。 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * 判断标签页 URL 是否允许注入和处理。
 * 拒绝空 URL、Chrome 内部页、扩展页以及非 http/https 协议。
 */
export function evaluateTab(url: string): TabPolicyResult {
  if (url.length === 0) {
    return { processable: false, reason: 'PAGE_RESTRICTED', domain: '' }
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { processable: false, reason: 'PAGE_RESTRICTED', domain: '' }
  }

  if (RESTRICTED_PROTOCOLS.has(parsed.protocol)) {
    return { processable: false, reason: 'PAGE_RESTRICTED', domain: '' }
  }

  if (!INJECTABLE_PROTOCOLS.has(parsed.protocol)) {
    return { processable: false, reason: 'PAGE_RESTRICTED', domain: '' }
  }

  return { processable: true, reason: null, domain: parsed.hostname }
}
