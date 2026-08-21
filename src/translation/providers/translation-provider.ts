import type { ExtractedArticle } from '../../shared/contracts/article'
import type { ModelSettings } from '../../shared/contracts/settings'

/** 翻译请求：模型设置、文章输入和取消信号。 */
export interface TranslationRequest {
  settings: ModelSettings
  article: ExtractedArticle
  signal: AbortSignal
}

/**
 * 翻译 Provider 接口。
 * 以异步文本增量形式输出最终内容，不暴露 OpenAI SDK 流事件。
 */
export interface TranslationProvider {
  translate(request: TranslationRequest): AsyncIterable<string>
}
