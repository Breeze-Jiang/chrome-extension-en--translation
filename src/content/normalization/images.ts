import { resolveUrl } from './links'

/** 常见延迟加载图片属性，存储真实图片地址。 */
const LAZY_ATTRS = ['data-src', 'data-original', 'data-lazy-src', 'data-actualsrc', 'data-url']

/** 占位图与跟踪像素特征，命中即视为无正文图片。 */
const PLACEHOLDER_PATTERNS = [/data:image\/gif;base64/i, /blank\.gif/i, /1x1/i, /spacer\.gif/i, /pixel\.gif/i]

function isPlaceholder(url: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(url))
}

/** 从 srcset 中挑选分辨率最高的候选 URL（取最后一个候选）。 */
function pickBestSrcset(srcset: string): string | null {
  const candidates = srcset
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  if (candidates.length === 0) {
    return null
  }
  const best = candidates[candidates.length - 1]
  return best.split(/\s+/)[0] || null
}

/** 解析图片真实地址，依次评估懒加载属性、srcset 与 src，排除占位图。 */
export function resolveImageSrc(img: HTMLElement): string | null {
  for (const attr of LAZY_ATTRS) {
    const value = img.getAttribute(attr)
    if (value && !isPlaceholder(value)) {
      return value
    }
  }

  const srcset = img.getAttribute('data-srcset') || img.getAttribute('srcset')
  if (srcset) {
    const best = pickBestSrcset(srcset)
    if (best && !isPlaceholder(best)) {
      return best
    }
  }

  const src = img.getAttribute('src')
  if (src && !isPlaceholder(src)) {
    return src
  }
  return null
}

/** 规范化正文图片：解析真实地址、转为绝对地址，移除占位图与跟踪像素。 */
export function normalizeImages(root: HTMLElement, baseUrl: string): void {
  const images = Array.from(root.querySelectorAll('img'))
  for (const img of images) {
    const src = resolveImageSrc(img)
    if (!src) {
      img.remove()
      continue
    }
    img.setAttribute('src', resolveUrl(src, baseUrl))
  }
}
