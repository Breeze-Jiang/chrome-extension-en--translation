import type { ExtractionCandidate } from './extractor'

/** 与正文无关的导航/登录/订阅/评论/广告类词汇，用于噪声信号评分。 */
const NOISE_TERMS = [
  'sign in',
  'log in',
  'subscribe',
  'newsletter',
  'comment',
  'share',
  'sponsored',
  'advertisement',
  'related articles',
  'recommended',
  'trending',
  'menu',
  'home',
]

function parseContent(content: string): Document {
  return new DOMParser().parseFromString(content, 'text/html')
}

/** 计算正文文本的段落数量。 */
function countParagraphs(doc: Document): number {
  return doc.body?.querySelectorAll('p').length ?? 0
}

/** 计算链接文本占总文本的比例。 */
function linkDensity(doc: Document, textLength: number): number {
  const linkTextLength = Array.from(doc.body?.querySelectorAll('a') ?? [])
    .map((link) => (link.textContent || '').length)
    .reduce((sum, length) => sum + length, 0)
  return textLength > 0 ? linkTextLength / textLength : 0
}

/** 统计噪声词汇命中次数。 */
function countNoiseTerms(text: string): number {
  const lower = text.toLowerCase()
  return NOISE_TERMS.filter((term) => lower.includes(term)).length
}

/**
 * 评估提取候选质量，返回 0-100 的分数。
 * 综合正文长度、标题、段落数量、链接密度和噪声词汇，供主/回退提取器比较。
 */
export function evaluateQuality(candidate: ExtractionCandidate): number {
  const doc = parseContent(candidate.content)
  const text = (doc.body?.textContent || '').trim()
  const textLength = text.length

  let score = 50

  // 正文是否存在且达到最低有效长度。
  if (textLength < 100) {
    score -= 30
  } else if (textLength < 300) {
    score -= 10
  } else if (textLength >= 500) {
    score += 10
  }

  // 标题是否存在。
  if (candidate.title.trim().length > 0) {
    score += 15
  }

  // 段落数量与平均长度。
  const paragraphs = countParagraphs(doc)
  if (paragraphs >= 3) {
    score += 10
  } else if (paragraphs === 0) {
    score -= 10
  }

  // 文本与链接比例。
  if (linkDensity(doc, textLength) > 0.3) {
    score -= 15
  }

  // 噪声词汇密集度。
  const noiseHits = countNoiseTerms(text)
  if (noiseHits > 0) {
    score -= noiseHits * 5
  }

  return Math.max(0, Math.min(100, score))
}
