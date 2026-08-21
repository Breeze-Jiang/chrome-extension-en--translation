import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ExtractedArticle } from '../../shared/contracts/article'
import type { ModelSettings } from '../../shared/contracts/settings'
import { AppError } from '../../shared/errors/app-error'

import { OpenAICompatibleProvider } from './openai-compatible'
import type { TranslationRequest } from './translation-provider'

const { createMock, OpenAIMock, errors } = vi.hoisted(() => {
  class OpenAIError extends Error { }
  class APIError extends OpenAIError {
    status?: number
    constructor(status?: number, message?: string) {
      super(message)
      this.status = status
    }
  }
  class APIUserAbortError extends APIError { }
  class APIConnectionError extends APIError { }
  class APIConnectionTimeoutError extends APIConnectionError { }
  class AuthenticationError extends APIError { }
  class RateLimitError extends APIError { }

  const createMock = vi.fn()
  const OpenAIMock = vi.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } },
  }))

  return {
    createMock,
    OpenAIMock,
    errors: {
      OpenAIError,
      APIError,
      APIUserAbortError,
      APIConnectionError,
      APIConnectionTimeoutError,
      AuthenticationError,
      RateLimitError,
    },
  }
})

vi.mock('openai', () => ({
  default: OpenAIMock,
  OpenAI: OpenAIMock,
  OpenAIError: errors.OpenAIError,
  APIError: errors.APIError,
  APIUserAbortError: errors.APIUserAbortError,
  APIConnectionError: errors.APIConnectionError,
  APIConnectionTimeoutError: errors.APIConnectionTimeoutError,
  AuthenticationError: errors.AuthenticationError,
  RateLimitError: errors.RateLimitError,
}))

const settings: ModelSettings = {
  version: 1,
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: 'sk-test-key',
  model: 'qwen-plus',
}

const article: ExtractedArticle = {
  version: 1,
  url: 'https://example.com/article',
  title: 'How to Build Reliable AI Systems',
  author: 'Jane Doe',
  language: 'en',
  siteName: 'Example',
  markdown: '# Title\n\nBody text.',
  charCount: 50,
  extractor: 'defuddle',
  qualityScore: 85,
  extractedAt: '2026-08-21T10:00:00.000Z',
}

function chunk(content: string) {
  return { choices: [{ delta: { content } }] }
}

async function* toStream(chunks: unknown[]) {
  for (const item of chunks) {
    yield item
  }
}

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = []
  for await (const item of iterable) {
    out.push(item)
  }
  return out
}

function makeRequest(signal: AbortSignal): TranslationRequest {
  return { settings, article, signal }
}

beforeEach(() => {
  createMock.mockReset()
  OpenAIMock.mockClear()
})

describe('OpenAICompatibleProvider 流式输出', () => {
  it('按顺序产出中文多字节增量', async () => {
    createMock.mockResolvedValue(toStream([chunk('你'), chunk('好'), chunk('世界')]))

    const provider = new OpenAICompatibleProvider()
    const chunks = await collect(provider.translate(makeRequest(new AbortController().signal)))

    expect(chunks).toEqual(['你', '好', '世界'])
  })

  it('忽略空增量和空 choices', async () => {
    createMock.mockResolvedValue(
      toStream([
        chunk(''),
        { choices: [] },
        { choices: [{ delta: {} }] },
        chunk('正文'),
      ]),
    )

    const provider = new OpenAICompatibleProvider()
    const chunks = await collect(provider.translate(makeRequest(new AbortController().signal)))

    expect(chunks).toEqual(['正文'])
  })

  it('使用传入的 baseUrl、apiKey 和模型名，无需修改调用方', async () => {
    createMock.mockResolvedValue(toStream([chunk('译文')]))

    const provider = new OpenAICompatibleProvider()
    await collect(provider.translate(makeRequest(new AbortController().signal)))

    expect(OpenAIMock).toHaveBeenCalledWith({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl,
    })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: settings.model, stream: true }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })
})

describe('OpenAICompatibleProvider 取消', () => {
  it('取消信号触发后停止消费后续事件', async () => {
    const controller = new AbortController()
    async function* abortedStream() {
      yield chunk('第一段')
      controller.abort()
      yield chunk('第二段')
    }
    createMock.mockResolvedValue(abortedStream())

    const provider = new OpenAICompatibleProvider()
    const chunks = await collect(provider.translate(makeRequest(controller.signal)))

    expect(chunks).toEqual(['第一段'])
  })

  it('用户中止错误被静默处理，不向外抛出', async () => {
    createMock.mockRejectedValue(new errors.APIUserAbortError(undefined, 'aborted'))

    const provider = new OpenAICompatibleProvider()
    const chunks = await collect(provider.translate(makeRequest(new AbortController().signal)))

    expect(chunks).toEqual([])
  })
})

describe('OpenAICompatibleProvider 错误归一化', () => {
  it('鉴权错误归一化为 AUTH_ERROR，且不泄漏密钥', async () => {
    createMock.mockRejectedValue(new errors.AuthenticationError(401, 'invalid api key'))

    const provider = new OpenAICompatibleProvider()
    const error = await collect(
      provider.translate(makeRequest(new AbortController().signal)),
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('AUTH_ERROR')
    expect((error as AppError).message).not.toContain(settings.apiKey)
  })

  it('限流错误归一化为 RATE_LIMITED', async () => {
    createMock.mockRejectedValue(new errors.RateLimitError(429, 'rate limited'))

    const provider = new OpenAICompatibleProvider()
    const error = await collect(
      provider.translate(makeRequest(new AbortController().signal)),
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('RATE_LIMITED')
  })

  it('连接中断归一化为 STREAM_INTERRUPTED', async () => {
    createMock.mockRejectedValue(new errors.APIConnectionError(undefined, 'connection reset'))

    const provider = new OpenAICompatibleProvider()
    const error = await collect(
      provider.translate(makeRequest(new AbortController().signal)),
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('STREAM_INTERRUPTED')
  })

  it('其他 API 错误归一化为 NETWORK_ERROR，且不泄漏完整响应', async () => {
    createMock.mockRejectedValue(new errors.APIError(500, 'internal error'))

    const provider = new OpenAICompatibleProvider()
    const error = await collect(
      provider.translate(makeRequest(new AbortController().signal)),
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('NETWORK_ERROR')
    expect((error as AppError).message).not.toContain('internal error')
  })
})
