import { describe, expect, it } from 'vitest'

import { AppError, isAppErrorCode, toAppError } from '../errors/app-error'
import { validateExtensionMessage } from '../messaging/messages'
import type { ExtensionMessage } from '../messaging/messages'
import { validateExtractedArticle } from './article'
import { validateModelSettings } from './settings'
import type { TranslationState } from './translation'
import { validateTranslationResult } from './translation'

const article = {
  version: 1,
  url: 'https://example.com/article',
  title: 'How to Build Reliable AI Systems',
  author: 'Jane Doe',
  language: 'en',
  siteName: 'Example',
  markdown: '# How to Build Reliable AI Systems\n\nBody text.',
  charCount: 42,
  extractor: 'defuddle',
  qualityScore: 85,
  extractedAt: '2026-08-21T10:00:00.000Z',
}

const settings = {
  version: 1,
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: 'sk-test-key',
  model: 'qwen-plus',
}

const result = {
  version: 1,
  sourceUrl: 'https://example.com/article',
  title: '如何构建可靠的 AI 系统',
  author: 'Jane Doe',
  markdown: '# 如何构建可靠的 AI 系统\n\n译文正文。',
  completedAt: '2026-08-21T10:05:00.000Z',
  model: 'qwen-plus',
}

function without<T extends Record<string, unknown>>(
  input: T,
  key: string,
): Record<string, unknown> {
  const copy = { ...input }
  delete copy[key]
  return copy
}

function assertNever(value: never): never {
  throw new Error(`unreachable: ${String(value)}`)
}

describe('ExtractedArticle 契约校验', () => {
  it('接受合法载荷并返回相同字段', () => {
    const parsed = validateExtractedArticle(article)
    expect(parsed).toEqual(article)
  })

  it('缺少作者字段时拒绝', () => {
    expect(() => validateExtractedArticle(without(article, 'author'))).toThrow()
  })

  it('版本不受支持时拒绝', () => {
    expect(() => validateExtractedArticle({ ...article, version: 99 })).toThrow()
  })

  it('字段类型错误时拒绝', () => {
    expect(() => validateExtractedArticle({ ...article, markdown: 123 })).toThrow()
    expect(() => validateExtractedArticle({ ...article, charCount: 'abc' })).toThrow()
  })

  it('非对象载荷时拒绝', () => {
    expect(() => validateExtractedArticle(null)).toThrow()
    expect(() => validateExtractedArticle('article')).toThrow()
  })
})

describe('ModelSettings 契约校验', () => {
  it('接受合法载荷并返回相同字段', () => {
    expect(validateModelSettings(settings)).toEqual(settings)
  })

  it('缺少 API Key 时拒绝', () => {
    expect(() => validateModelSettings(without(settings, 'apiKey'))).toThrow()
  })

  it('版本不受支持时拒绝', () => {
    expect(() => validateModelSettings({ ...settings, version: 99 })).toThrow()
  })

  it('字段类型错误时拒绝', () => {
    expect(() => validateModelSettings({ ...settings, baseUrl: 42 })).toThrow()
  })
})

describe('TranslationResult 契约校验', () => {
  it('接受合法载荷并返回相同字段', () => {
    expect(validateTranslationResult(result)).toEqual(result)
  })

  it('缺少标题时拒绝', () => {
    expect(() => validateTranslationResult(without(result, 'title'))).toThrow()
  })

  it('版本不受支持时拒绝', () => {
    expect(() => validateTranslationResult({ ...result, version: 99 })).toThrow()
  })

  it('字段类型错误时拒绝', () => {
    expect(() => validateTranslationResult({ ...result, markdown: 0 })).toThrow()
  })
})

describe('扩展消息校验', () => {
  it('接受合法提取请求', () => {
    const message = {
      type: 'EXTRACT_ARTICLE_REQUEST',
      protocolVersion: 1,
      requestId: 'req-1',
      tabId: 12,
      url: 'https://example.com/article',
    }
    expect(validateExtensionMessage(message)).toEqual(message)
  })

  it('接受合法成功响应', () => {
    const message = {
      type: 'EXTRACT_ARTICLE_SUCCESS',
      protocolVersion: 1,
      requestId: 'req-1',
      article,
    }
    expect(validateExtensionMessage(message)).toEqual(message)
  })

  it('接受合法失败响应', () => {
    const message = {
      type: 'EXTRACT_ARTICLE_FAILURE',
      protocolVersion: 1,
      requestId: 'req-1',
      errorCode: 'EXTRACTION_FAILED',
    }
    expect(validateExtensionMessage(message)).toEqual(message)
  })

  it('缺少 requestId 时拒绝', () => {
    const message = {
      type: 'EXTRACT_ARTICLE_REQUEST',
      protocolVersion: 1,
    }
    expect(() => validateExtensionMessage(message)).toThrow()
  })

  it('协议版本不受支持时拒绝', () => {
    const message = {
      type: 'EXTRACT_ARTICLE_REQUEST',
      protocolVersion: 99,
      requestId: 'req-1',
    }
    expect(() => validateExtensionMessage(message)).toThrow()
  })

  it('未知消息类型时拒绝', () => {
    const message = { type: 'UNKNOWN', protocolVersion: 1, requestId: 'req-1' }
    expect(() => validateExtensionMessage(message)).toThrow()
  })

  it('失败响应缺少有效错误码时拒绝', () => {
    const message = {
      type: 'EXTRACT_ARTICLE_FAILURE',
      protocolVersion: 1,
      requestId: 'req-1',
      errorCode: 'NOT_A_CODE',
    }
    expect(() => validateExtensionMessage(message)).toThrow()
  })
})

describe('当前标签页与页面探针消息校验', () => {
  const activeTabInfo = {
    tabId: 7,
    title: 'Example',
    url: 'https://example.com',
    domain: 'example.com',
    processable: true,
    reason: null,
  }

  it('接受合法的活动标签页响应', () => {
    const message = {
      type: 'GET_ACTIVE_TAB_RESPONSE',
      protocolVersion: 1,
      requestId: 'req-1',
      tab: activeTabInfo,
    }
    expect(validateExtensionMessage(message)).toEqual(message)
  })

  it('接受合法的页面探针请求与响应', () => {
    expect(
      validateExtensionMessage({
        type: 'PAGE_PROBE_REQUEST',
        protocolVersion: 1,
        requestId: 'req-1',
      }),
    ).toEqual({ type: 'PAGE_PROBE_REQUEST', protocolVersion: 1, requestId: 'req-1' })

    expect(
      validateExtensionMessage({
        type: 'PAGE_PROBE_RESPONSE',
        protocolVersion: 1,
        requestId: 'req-1',
        probe: { title: 'T', url: 'https://example.com', visibleTextLength: 12 },
      }),
    ).toEqual({
      type: 'PAGE_PROBE_RESPONSE',
      protocolVersion: 1,
      requestId: 'req-1',
      probe: { title: 'T', url: 'https://example.com', visibleTextLength: 12 },
    })
  })

  it('活动标签页 reason 非法时拒绝', () => {
    const message = {
      type: 'GET_ACTIVE_TAB_RESPONSE',
      protocolVersion: 1,
      requestId: 'req-1',
      tab: { ...activeTabInfo, reason: 'NOT_A_CODE' },
    }
    expect(() => validateExtensionMessage(message)).toThrow()
  })

  it('页面探针可见文本长度非法时拒绝', () => {
    const message = {
      type: 'PAGE_PROBE_RESPONSE',
      protocolVersion: 1,
      requestId: 'req-1',
      probe: { title: 'T', url: 'https://example.com', visibleTextLength: -1 },
    }
    expect(() => validateExtensionMessage(message)).toThrow()
  })
})

describe('统一错误模型', () => {
  it('AppError 保留错误码、消息与原因', () => {
    const cause = new Error('upstream')
    const error = new AppError('AUTH_ERROR', '鉴权失败', { cause })
    expect(error.code).toBe('AUTH_ERROR')
    expect(error.message).toBe('鉴权失败')
    expect(error.cause).toBe(cause)
    expect(error instanceof Error).toBe(true)
  })

  it('错误码守卫识别合法码并拒绝未知值', () => {
    expect(isAppErrorCode('NETWORK_ERROR')).toBe(true)
    expect(isAppErrorCode('INVALID_OUTPUT')).toBe(true)
    expect(isAppErrorCode('NOT_A_CODE')).toBe(false)
    expect(isAppErrorCode(42)).toBe(false)
  })

  it('toAppError 对已有 AppError 原样返回', () => {
    const error = new AppError('RATE_LIMITED', '限流')
    expect(toAppError(error)).toBe(error)
  })

  it('toAppError 将普通异常归一化为 AppError', () => {
    const normalized = toAppError(new Error('boom'))
    expect(normalized instanceof AppError).toBe(true)
    expect(normalized.code).toBe('NETWORK_ERROR')
  })
})

describe('状态与消息的 TypeScript 穷尽检查', () => {
  it('TranslationState 全部分支可穷尽匹配', () => {
    function describeState(state: TranslationState): string {
      switch (state.kind) {
        case 'idle':
          return 'idle'
        case 'extracting':
          return 'extracting'
        case 'preview':
          return 'preview'
        case 'translating':
          return 'translating'
        case 'completed':
          return 'completed'
        case 'failed':
          return `failed:${state.errorCode}`
        case 'cancelled':
          return 'cancelled'
      }
      assertNever(state)
    }

    expect(describeState({ kind: 'idle' })).toBe('idle')
    expect(describeState({ kind: 'failed', errorCode: 'NETWORK_ERROR' })).toBe(
      'failed:NETWORK_ERROR',
    )
  })

  it('ExtensionMessage 全部分支可穷尽匹配', () => {
    function describeMessage(message: ExtensionMessage): string {
      switch (message.type) {
        case 'EXTRACT_ARTICLE_REQUEST':
          return 'request'
        case 'EXTRACT_ARTICLE_SUCCESS':
          return 'success'
        case 'EXTRACT_ARTICLE_FAILURE':
          return 'failure'
        case 'GET_ACTIVE_TAB_REQUEST':
        case 'GET_ACTIVE_TAB_RESPONSE':
          return 'active-tab'
        case 'PAGE_PROBE_REQUEST':
        case 'PAGE_PROBE_RESPONSE':
        case 'PAGE_PROBE_FAILURE':
          return 'page-probe'
      }
      assertNever(message)
    }

    expect(
      describeMessage({
        type: 'EXTRACT_ARTICLE_REQUEST',
        protocolVersion: 1,
        requestId: 'req-1',
        tabId: 12,
        url: 'https://example.com/article',
      }),
    ).toBe('request')
  })
})
