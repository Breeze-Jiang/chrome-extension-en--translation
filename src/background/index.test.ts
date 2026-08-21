import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MESSAGE_PROTOCOL_VERSION, MESSAGE_TYPES } from '../shared/messaging/messages'

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

describe('Background 提取转发', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('把提取请求转发到活动标签页并返回内容脚本响应', async () => {
    let listener!: (message: unknown, sender: unknown, sendResponse: (value: unknown) => void) => boolean
    const sendMessage = vi.fn(async (_tabId: number, request: { requestId: string }) => ({
      type: MESSAGE_TYPES.EXTRACT_ARTICLE_SUCCESS,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: request.requestId,
      article,
    }))
    vi.stubGlobal('chrome', {
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn((value) => { listener = value }) },
      },
      sidePanel: { setPanelBehavior: vi.fn() },
      tabs: {
        query: vi.fn(async () => [{ id: 12, url: article.url, title: article.title }]),
        sendMessage,
      },
    })
    await import('./index')

    const request = {
      type: MESSAGE_TYPES.EXTRACT_ARTICLE_REQUEST,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: 'req-extract',
      tabId: 12,
      url: article.url,
    }
    const response = await new Promise((resolve) => {
      expect(listener(request, {}, resolve)).toBe(true)
    })

    expect(sendMessage).toHaveBeenCalledWith(12, request)
    expect(response).toMatchObject({
      type: MESSAGE_TYPES.EXTRACT_ARTICLE_SUCCESS,
      requestId: 'req-extract',
      article,
    })
    vi.unstubAllGlobals()
  })
})
