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

  it('Tabs API 隐藏 URL 时通过页面探针恢复活动网页信息', async () => {
    let listener!: BackgroundListener
    const sendMessage = vi.fn(async (_tabId: number, message: { type: string; requestId: string }) => ({
      type: MESSAGE_TYPES.PAGE_PROBE_RESPONSE,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: message.requestId,
      probe: {
        title: 'Science Article',
        url: 'https://www.science.org/content/article/example',
        visibleTextLength: 1200,
      },
    }))
    vi.stubGlobal('chrome', {
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn((value) => { listener = value }) },
      },
      sidePanel: { setPanelBehavior: vi.fn() },
      tabs: {
        query: vi.fn(async () => [{ id: 12 }]),
        sendMessage,
      },
    })
    await import('./index')

    const request = {
      type: MESSAGE_TYPES.GET_ACTIVE_TAB_REQUEST,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: 'req-active-tab',
    }
    const response = await new Promise((resolve) => {
      expect(listener(request, {}, resolve)).toBe(true)
    })

    expect(response).toMatchObject({
      type: MESSAGE_TYPES.GET_ACTIVE_TAB_RESPONSE,
      tab: {
        tabId: 12,
        title: 'Science Article',
        url: 'https://www.science.org/content/article/example',
        domain: 'www.science.org',
        processable: true,
        reason: null,
      },
    })
  })

  it('Tabs API 隐藏 URL 时通过页面探针校验后继续提取', async () => {
    let listener!: BackgroundListener
    const request = extractRequest()
    const sendMessage = vi.fn(async (_tabId: number, message: { type: string; requestId: string }) => {
      if (message.type === MESSAGE_TYPES.PAGE_PROBE_REQUEST) {
        return {
          type: MESSAGE_TYPES.PAGE_PROBE_RESPONSE,
          protocolVersion: MESSAGE_PROTOCOL_VERSION,
          requestId: message.requestId,
          probe: {
            title: article.title,
            url: article.url,
            visibleTextLength: 1200,
          },
        }
      }
      return extractSuccess()
    })
    vi.stubGlobal('chrome', {
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn((value) => { listener = value }) },
      },
      sidePanel: { setPanelBehavior: vi.fn() },
      tabs: {
        query: vi.fn(async () => [{ id: 12 }]),
        sendMessage,
      },
    })
    await import('./index')

    const response = await new Promise((resolve) => {
      expect(listener(request, {}, resolve)).toBe(true)
    })

    expect(sendMessage).toHaveBeenNthCalledWith(1, 12, expect.objectContaining({
      type: MESSAGE_TYPES.PAGE_PROBE_REQUEST,
    }))
    expect(sendMessage).toHaveBeenNthCalledWith(2, 12, request)
    expect(response).toMatchObject(extractSuccess())
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
