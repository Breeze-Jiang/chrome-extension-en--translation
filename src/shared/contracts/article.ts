import { isFiniteNumber, isRecord, isString } from './validation'

/** 提取文章契约版本。结构不兼容变更时必须递增。 */
export const ARTICLE_CONTRACT_VERSION = 1

export const EXTRACTOR_IDS = ['defuddle', 'readability'] as const

export type ExtractorId = (typeof EXTRACTOR_IDS)[number]

/**
 * 内容提取层返回的统一文章契约。
 * 业务层只能依赖该对象，不能直接依赖 Defuddle/Readability 的原始返回类型。
 */
export interface ExtractedArticle {
  /** 数据契约版本 */
  version: number
  /** 原始页面 URL */
  url: string
  /** 原始标题 */
  title: string
  /** 作者；无法识别时为空字符串 */
  author: string
  /** 页面语言代码 */
  language: string
  /** 站点名称 */
  siteName: string
  /** Markdown 正文 */
  markdown: string
  /** 正文字符数 */
  charCount: number
  /** 使用的提取器 */
  extractor: ExtractorId
  /** 提取质量分数（0-100） */
  qualityScore: number
  /** 提取时间（ISO 字符串） */
  extractedAt: string
}

/** 校验外部载荷是否为合法的 ExtractedArticle，非法时抛错。 */
export function validateExtractedArticle(input: unknown): ExtractedArticle {
  if (!isRecord(input)) {
    throw new Error('ExtractedArticle 载荷必须是对象')
  }
  if (input.version !== ARTICLE_CONTRACT_VERSION) {
    throw new Error('ExtractedArticle 版本不受支持')
  }
  if (!isString(input.url) || input.url.length === 0) {
    throw new Error('ExtractedArticle.url 必须是非空字符串')
  }
  if (!isString(input.title) || input.title.length === 0) {
    throw new Error('ExtractedArticle.title 必须是非空字符串')
  }
  if (!isString(input.author)) {
    throw new Error('ExtractedArticle.author 必须是字符串')
  }
  if (!isString(input.language)) {
    throw new Error('ExtractedArticle.language 必须是字符串')
  }
  if (!isString(input.siteName)) {
    throw new Error('ExtractedArticle.siteName 必须是字符串')
  }
  if (!isString(input.markdown) || input.markdown.length === 0) {
    throw new Error('ExtractedArticle.markdown 必须是非空字符串')
  }
  if (!isFiniteNumber(input.charCount) || input.charCount < 0) {
    throw new Error('ExtractedArticle.charCount 必须是非负数字')
  }
  if (!isString(input.extractor) || !(EXTRACTOR_IDS as readonly string[]).includes(input.extractor)) {
    throw new Error('ExtractedArticle.extractor 不受支持')
  }
  if (!isFiniteNumber(input.qualityScore) || input.qualityScore < 0 || input.qualityScore > 100) {
    throw new Error('ExtractedArticle.qualityScore 必须是 0-100 的数字')
  }
  if (!isString(input.extractedAt) || input.extractedAt.length === 0) {
    throw new Error('ExtractedArticle.extractedAt 必须是非空字符串')
  }
  return {
    version: input.version,
    url: input.url,
    title: input.title,
    author: input.author,
    language: input.language,
    siteName: input.siteName,
    markdown: input.markdown,
    charCount: input.charCount,
    extractor: input.extractor as ExtractorId,
    qualityScore: input.qualityScore,
    extractedAt: input.extractedAt,
  }
}
