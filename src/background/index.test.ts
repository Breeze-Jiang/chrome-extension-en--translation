import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

type BackgroundListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (value: unknown) => void,
) => boolean

function extractRequest() {
  return {
    type: MESSAGE_TYPES.EXTRACT_ARTICLE_REQUEST,
    protocolVersion: MESSAGE_PROTOCOL_VERSION,
    requestId: 'req-extract',
    tabId: 12,
    url: article.url,
  }
}

function extractSuccess() {
  return {
    type: MESSAGE_TYPES.EXTRACT_ARTICLE_SUCCESS,
    protocolVersion: MESSAGE_PROTOCOL_VERSION,
    requestId: 'req-extract',
    article,
  }
}

describe('Background 提取转发', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('把提取请求转发到已注入的活动标签页并返回内容脚本响应', async () => {
    let listener!: BackgroundListener
    const sendMessage = vi.fn(async () => extractSuccess())
    const executeScript = vi.fn()
    vi.stubGlobal('chrome', {
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn((value) => { listener = value }) },
      },
      sidePanel: { setPanelBehavior: vi.fn() },
      scripting: { executeScript },
      tabs: {
        query: vi.fn(async () => [{ id: 12, url: article.url, title: article.title }]),
        sendMessage,
      },
    })
    await import('./index')

    const request = extractRequest()
    const response = await new Promise((resolve) => {
      expect(listener(request, {}, resolve)).toBe(true)
    })

    expect(sendMessage).toHaveBeenCalledWith(12, request)
    expect(response).toMatchObject(extractSuccess())
  })

})
