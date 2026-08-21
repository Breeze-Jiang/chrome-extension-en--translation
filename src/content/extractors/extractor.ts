import type { ExtractedArticle } from '../../shared/contracts/article'

/**
 * 内部提取候选。
 * Defuddle 与 Readability 的原始返回类型只在 extractors 目录内被转换，
 * 不得扩散到领域层；业务层仅依赖该统一候选对象。
 */
export interface ExtractionCandidate {
  /** 文章标题；无法识别时为空字符串 */
  title: string
  /** 作者；无法识别时为空字符串 */
  author: string
  /** 站点名称 */
  siteName: string
  /** 页面语言代码 */
  language: string
  /** 正文 HTML（T07 负责转换为 Markdown） */
  content: string
  /** 正文字符数近似值 */
  charCount: number
  /** 使用的提取器标识 */
  extractor: ExtractedArticle['extractor']
}

/** 提取器统一接口。 */
export interface Extractor {
  readonly id: ExtractedArticle['extractor']
  extract(document: Document, url: string): ExtractionCandidate | null
}
