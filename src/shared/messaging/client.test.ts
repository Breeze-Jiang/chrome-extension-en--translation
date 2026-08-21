import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAppError } from '../errors/app-error'
import { createRequestId, extractArticle, probePage, requestActiveTab } from './client'
import { MESSAGE_PROTOCOL_VERSION, MESSAGE_TYPES } from './messages'

const sendMessage = vi.fn()

beforeEach(() => {
  sendMessage.mockReset()
  vi.stubGlobal('chrome', { runtime: { sendMessage } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const activeTab = {
  tabId: 12,
  title: 'How to Build Reliable AI Systems',
  url: 'https://example.com/article',
  domain: 'example.com',
  processable: true,
  reason: null,
}

describe('createRequestId', () => {
  it('生成非空且带前缀的请求 ID', () => {
    expect(createRequestId()).toMatch(/^req-/)
  })

  it('连续生成互不相同', () => {
    expect(createRequestId()).not.toBe(createRequestId())
  })
})

describe('requestActiveTab', () => {
  it('发送协议版本与唯一请求 ID 并返回标签页信息', async () => {
    sendMessage.mockImplementation(async (message: unknown) => ({
      type: MESSAGE_TYPES.GET_ACTIVE_TAB_RESPONSE,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: (message as { requestId: string }).requestId,
      tab: activeTab,
    }))

    await expect(requestActiveTab()).resolves.toEqual(activeTab)

    const sent = sendMessage.mock.calls[0][0] as {
      type: string
      protocolVersion: number
      requestId: string
    }
    expect(sent.type).toBe(MESSAGE_TYPES.GET_ACTIVE_TAB_REQUEST)
    expect(sent.protocolVersion).toBe(MESSAGE_PROTOCOL_VERSION)
    expect(typeof sent.requestId).toBe('string')
    expect(sent.requestId.length).toBeGreaterThan(0)
  })

  it('后台返回意外消息类型时归一化为错误', async () => {
    sendMessage.mockImplementation(async (message: unknown) => ({
      type: MESSAGE_TYPES.PAGE_PROBE_REQUEST,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: (message as { requestId: string }).requestId,
    }))

    const error = await requestActiveTab().catch((e: unknown) => e)
    expect(isAppError(error)).toBe(true)
  })

  it('响应请求 ID 不匹配时丢弃', async () => {
    sendMessage.mockResolvedValue({
      type: MESSAGE_TYPES.GET_ACTIVE_TAB_RESPONSE,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: 'stale-id',
      tab: activeTab,
    })

    const error = await requestActiveTab().catch((e: unknown) => e)
    expect(isAppError(error)).toBe(true)
  })
})

describe('extractArticle', () => {
  const article = {
    version: 1,
    url: 'https://example.com/article',
    title: 'Article',
    author: '',
    language: 'en',
    siteName: 'Example',
    markdown: '# Article',
    charCount: 9,
    extractor: 'defuddle',
    qualityScore: 90,
    extractedAt: '2026-08-21T10:00:00.000Z',
  }

  it('发送提取请求并返回标准文章对象', async () => {
    sendMessage.mockImplementation(async (message: unknown) => ({
      type: MESSAGE_TYPES.EXTRACT_ARTICLE_SUCCESS,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: (message as { requestId: string }).requestId,
      article,
    }))

    await expect(extractArticle(12, 'https://example.com/article')).resolves.toEqual(article)
    expect(sendMessage.mock.calls[0][0]).toMatchObject({
      type: MESSAGE_TYPES.EXTRACT_ARTICLE_REQUEST,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      tabId: 12,
      url: 'https://example.com/article',
    })
  })

  it('后台返回提取失败时抛出对应错误码', async () => {
    sendMessage.mockImplementation(async (message: unknown) => ({
      type: MESSAGE_TYPES.EXTRACT_ARTICLE_FAILURE,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: (message as { requestId: string }).requestId,
      errorCode: 'EXTRACTION_FAILED',
    }))

    const error = await extractArticle(12, 'https://example.com/article').catch((e: unknown) => e)
    if (!isAppError(error)) {
      throw new Error('expected AppError')
    }
    expect(error.code).toBe('EXTRACTION_FAILED')
  })
})

describe('probePage', () => {
  it('发送探针请求并返回探针结果', async () => {
    sendMessage.mockImplementation(async (message: unknown) => ({
      type: MESSAGE_TYPES.PAGE_PROBE_RESPONSE,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: (message as { requestId: string }).requestId,
      probe: { title: 'Title', url: 'https://example.com', visibleTextLength: 123 },
    }))

    await expect(probePage()).resolves.toEqual({
      title: 'Title',
      url: 'https://example.com',
      visibleTextLength: 123,
    })
    expect(sendMessage.mock.calls[0][0]).toMatchObject({
      type: MESSAGE_TYPES.PAGE_PROBE_REQUEST,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
    })
  })

  it('后台返回探针失败时抛出对应错误码', async () => {
    sendMessage.mockImplementation(async (message: unknown) => ({
      type: MESSAGE_TYPES.PAGE_PROBE_FAILURE,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: (message as { requestId: string }).requestId,
      errorCode: 'PAGE_RESTRICTED',
    }))

    const error = await probePage().catch((e: unknown) => e)
    if (!isAppError(error)) {
      throw new Error('expected AppError')
    }
    expect(error.code).toBe('PAGE_RESTRICTED')
  })

  it('响应请求 ID 不匹配时丢弃', async () => {
    sendMessage.mockResolvedValue({
      type: MESSAGE_TYPES.PAGE_PROBE_RESPONSE,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: 'stale-id',
      probe: { title: 'Title', url: 'https://example.com', visibleTextLength: 1 },
    })

    const error = await probePage().catch((e: unknown) => e)
    expect(isAppError(error)).toBe(true)
  })
})
