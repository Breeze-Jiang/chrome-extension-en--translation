import type { ExtractedArticle } from '../../shared/contracts/article'
import { buildArticle } from '../markdown/converter'
import { DefuddleExtractor } from './defuddle-extractor'
import type { Extractor, ExtractionCandidate } from './extractor'
import { ReadabilityExtractor } from './readability-extractor'
import { evaluateQuality } from './quality-evaluator'

/** 主提取结果达到该质量分数即可直接采用，否则触发回退提取器。 */
const QUALITY_THRESHOLD = 40

/** 确定性与常见噪声节点，在进入提取器前从克隆 DOM 中移除。 */
const REMOVE_SELECTORS = [
  'script',
  'style',
  'form',
  'dialog',
  'nav',
  'footer',
  'aside',
  'iframe',
  'noscript',
  'template',
  '[class*="advert"]',
  '[class*="sponsor"]',
  '[class*="comment"]',
  '[class*="newsletter"]',
  '[class*="subscribe"]',
  '[class*="share"]',
  '[class*="related"]',
  '[class*="recommend"]',
  '[role="navigation"]',
  '[role="dialog"]',
  '[role="complementary"]',
]

/** 在克隆 DOM 上移除脚本、样式、表单、对话框及确定性非正文节点。 */
function cloneAndClean(document: Document): Document {
  const clone = document.cloneNode(true) as Document
  clone.querySelectorAll(REMOVE_SELECTORS.join(',')).forEach((node) => node.remove())
  return clone
}

/** 在克隆 DOM 上运行单个提取器，避免修改原页面。 */
function runExtractor(
  extractor: Extractor,
  document: Document,
  url: string,
): ExtractionCandidate | null {
  const clone = cloneAndClean(document)
  return extractor.extract(clone, url)
}

/**
 * 提取当前页面的主要文章及元数据。
 * 默认使用 Defuddle，结果异常或质量不足时回退到 Readability，并选择质量更高者。
 * 不修改原页面 DOM，不绕过登录、付费墙或验证码，不自动滚动页面。
 */
export function extractArticle(
  document: Document,
  url: string,
  options?: { primary?: Extractor; fallback?: Extractor },
): ExtractionCandidate | null {
  const primary = options?.primary ?? new DefuddleExtractor()
  const fallback = options?.fallback ?? new ReadabilityExtractor()

  const primaryResult = runExtractor(primary, document, url)
  if (primaryResult && evaluateQuality(primaryResult) >= QUALITY_THRESHOLD) {
    return primaryResult
  }

  const fallbackResult = runExtractor(fallback, document, url)

  if (!fallbackResult) {
    return primaryResult && evaluateQuality(primaryResult) >= QUALITY_THRESHOLD
      ? primaryResult
      : null
  }
  const selected =
    !primaryResult || evaluateQuality(fallbackResult) > evaluateQuality(primaryResult)
      ? fallbackResult
      : primaryResult

  return evaluateQuality(selected) >= QUALITY_THRESHOLD ? selected : null
}

/**
 * 提取文章并组装为标准化文章契约，正文为转换后的 Markdown。
 * 供内容脚本直接返回给侧边栏，不传输 DOM 或完整原始 HTML。
 */
export function extractArticleAsArticle(
  document: Document,
  url: string,
  options?: { primary?: Extractor; fallback?: Extractor },
): ExtractedArticle | null {
  const candidate = extractArticle(document, url, options)
  if (!candidate) {
    return null
  }
  return buildArticle(candidate, url)
}
