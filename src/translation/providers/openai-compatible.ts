import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  RateLimitError,
} from 'openai'

import { AppError } from '../../shared/errors/app-error'
import { buildTranslationMessages } from '../prompt-policy'
import type { TranslationProvider, TranslationRequest } from './translation-provider'

/** 判断错误是否由取消信号触发。 */
function isAbortError(error: unknown): boolean {
  if (error instanceof APIUserAbortError) {
    return true
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return true
  }
  return false
}

/** 将 OpenAI SDK 错误归一化为领域错误，不泄漏 API Key、授权头或完整响应。 */
function normalizeError(error: unknown): AppError {
  if (error instanceof AuthenticationError) {
    return new AppError('AUTH_ERROR', '鉴权失败，请检查 API Key。', { cause: error })
  }
  if (error instanceof RateLimitError) {
    return new AppError('RATE_LIMITED', '请求过于频繁，请稍后重试。', { cause: error })
  }
  if (error instanceof APIConnectionTimeoutError) {
    return new AppError('NETWORK_ERROR', '连接模型服务超时。', { cause: error })
  }
  if (error instanceof APIConnectionError) {
    return new AppError('STREAM_INTERRUPTED', '连接中断，翻译未完成。', { cause: error })
  }
  if (error instanceof APIError) {
    if (error.status === 401) {
      return new AppError('AUTH_ERROR', '鉴权失败，请检查 API Key。', { cause: error })
    }
    if (error.status === 429) {
      return new AppError('RATE_LIMITED', '请求过于频繁，请稍后重试。', { cause: error })
    }
    return new AppError('NETWORK_ERROR', '模型服务返回错误。', { cause: error })
  }
  return new AppError('NETWORK_ERROR', '翻译请求失败。', { cause: error })
}

/** OpenAI 兼容的 Qwen 流式翻译 Provider。 */
export class OpenAICompatibleProvider implements TranslationProvider {
  async *translate(request: TranslationRequest): AsyncIterable<string> {
    const client = new OpenAI({
      apiKey: request.settings.apiKey,
      baseURL: request.settings.baseUrl,
    })

    const messages = buildTranslationMessages(request.article)

    let stream
    try {
      stream = await client.chat.completions.create(
        {
          model: request.settings.model,
          messages,
          stream: true,
        },
        { signal: request.signal },
      )
    } catch (error) {
      if (isAbortError(error)) {
        return
      }
      throw normalizeError(error)
    }

    try {
      for await (const chunk of stream) {
        if (request.signal.aborted) {
          return
        }
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          yield delta
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        return
      }
      throw normalizeError(error)
    }
  }
}
