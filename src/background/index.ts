import type { AppErrorCode } from '../shared/errors/app-error'
import {
  MESSAGE_PROTOCOL_VERSION,
  MESSAGE_TYPES,
  validateExtensionMessage,
} from '../shared/messaging/messages'
import type {
  ActiveTabInfo,
  ExtensionMessage,
  ExtractArticleFailure,
  ExtractArticleRequest,
  ExtractArticleSuccess,
  GetActiveTabResponse,
  PageProbeFailure,
  PageProbeRequest,
  PageProbeResponse,
} from '../shared/messaging/messages'

import { evaluateTab } from './tab-policy'

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

/** 查询最近聚焦窗口中的活动标签页；查询失败时返回 undefined。 */
async function queryActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    // #region debug-point A-B-D:queried-active-tab
    void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'sidepanel-tab-detection', runId: 'pre-fix', hypothesisId: 'A-B-D', location: 'src/background/index.ts:queryActiveTab', msg: '[DEBUG] Background queried active tab', data: { count: tabs.length, id: tabs[0]?.id, url: tabs[0]?.url, title: tabs[0]?.title, windowId: tabs[0]?.windowId }, ts: Date.now() }) }).catch(() => { })
    // #endregion
    return tabs[0]
  } catch (error) {
    // #region debug-point B:query-failed
    void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'sidepanel-tab-detection', runId: 'pre-fix', hypothesisId: 'B', location: 'src/background/index.ts:queryActiveTab', msg: '[DEBUG] Background active-tab query failed', data: { error: String(error) }, ts: Date.now() }) }).catch(() => { })
    // #endregion
    return undefined
  }
}

async function probeTab(tabId: number, requestId: string): Promise<PageProbeResponse | null> {
  try {
    const request: PageProbeRequest = {
      type: MESSAGE_TYPES.PAGE_PROBE_REQUEST,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId,
    }
    const raw: unknown = await chrome.tabs.sendMessage(tabId, request)
    const message = validateExtensionMessage(raw)
    return message.type === MESSAGE_TYPES.PAGE_PROBE_RESPONSE && message.requestId === requestId
      ? message
      : null
  } catch {
    return null
  }
}

async function handleGetActiveTab(requestId: string): Promise<GetActiveTabResponse> {
  const tab = await queryActiveTab()
  const tabId = tab?.id ?? -1
  const probe = tabId >= 0 && !tab?.url ? await probeTab(tabId, requestId) : null
  const url = tab?.url ?? probe?.probe.url ?? ''
  const title = tab?.title ?? probe?.probe.title ?? ''
  const policy = evaluateTab(url)
  const info: ActiveTabInfo = {
    tabId,
    title,
    url,
    domain: policy.domain,
    processable: policy.processable,
    reason: policy.reason,
  }
  // #region debug-point A-B-D:resolved-active-tab
  void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'sidepanel-tab-detection', runId: 'post-fix', hypothesisId: 'A-B-D', location: 'src/background/index.ts:handleGetActiveTab', msg: '[DEBUG] Background resolved active tab', data: { tabId, url, title, usedProbe: probe !== null, processable: policy.processable }, ts: Date.now() }) }).catch(() => { })
  // #endregion
  return {
    type: MESSAGE_TYPES.GET_ACTIVE_TAB_RESPONSE,
    protocolVersion: MESSAGE_PROTOCOL_VERSION,
    requestId,
    tab: info,
  }
}

function buildProbeFailure(requestId: string, errorCode: AppErrorCode): PageProbeFailure {
  return {
    type: MESSAGE_TYPES.PAGE_PROBE_FAILURE,
    protocolVersion: MESSAGE_PROTOCOL_VERSION,
    requestId,
    errorCode,
  }
}

function buildExtractFailure(requestId: string, errorCode: AppErrorCode): ExtractArticleFailure {
  return {
    type: MESSAGE_TYPES.EXTRACT_ARTICLE_FAILURE,
    protocolVersion: MESSAGE_PROTOCOL_VERSION,
    requestId,
    errorCode,
  }
}

async function handleExtractArticle(
  requestId: string,
  expectedTabId: number,
  expectedUrl: string,
): Promise<ExtractArticleSuccess | ExtractArticleFailure> {
  try {
    const tab = await queryActiveTab()
    const probe = tab?.id === expectedTabId && !tab.url
      ? await probeTab(expectedTabId, requestId)
      : null
    const actualUrl = tab?.url ?? probe?.probe.url ?? ''
    // #region debug-point T1:extract-validation
    void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'translation-stream-stall', runId: 'post-fix', hypothesisId: 'T1', location: 'src/background/index.ts:handleExtractArticle', msg: '[DEBUG] Validating extraction tab', data: { expectedTabId, actualTabId: tab?.id, expectedUrlLength: expectedUrl.length, actualUrlLength: actualUrl.length, usedProbe: probe !== null, idsMatch: tab?.id === expectedTabId, urlsMatch: actualUrl === expectedUrl, actualUrlProcessable: evaluateTab(actualUrl).processable }, ts: Date.now() }) }).catch(() => { })
    // #endregion
    if (
      tab?.id === undefined ||
      tab.id !== expectedTabId ||
      actualUrl !== expectedUrl ||
      !evaluateTab(actualUrl).processable
    ) {
      return buildExtractFailure(requestId, 'PAGE_RESTRICTED')
    }
    const request: ExtractArticleRequest = {
      type: MESSAGE_TYPES.EXTRACT_ARTICLE_REQUEST,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId,
      tabId: expectedTabId,
      url: expectedUrl,
    }
    const raw: unknown = await chrome.tabs.sendMessage(tab.id, request)
    const message = validateExtensionMessage(raw)
    if (
      (message.type !== MESSAGE_TYPES.EXTRACT_ARTICLE_SUCCESS &&
        message.type !== MESSAGE_TYPES.EXTRACT_ARTICLE_FAILURE) ||
      message.requestId !== requestId
    ) {
      return buildExtractFailure(requestId, 'EXTRACTION_FAILED')
    }
    return message
  } catch {
    return buildExtractFailure(requestId, 'EXTRACTION_FAILED')
  }
}

async function handlePageProbe(requestId: string): Promise<PageProbeResponse | PageProbeFailure> {
  try {
    const tab = await queryActiveTab()
    if (tab?.id === undefined) {
      return buildProbeFailure(requestId, 'PAGE_RESTRICTED')
    }
    const url = tab.url ?? ''
    if (!evaluateTab(url).processable) {
      return buildProbeFailure(requestId, 'PAGE_RESTRICTED')
    }

    const request: PageProbeRequest = {
      type: MESSAGE_TYPES.PAGE_PROBE_REQUEST,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId,
    }
    const raw: unknown = await chrome.tabs.sendMessage(tab.id, request)
    const message = validateExtensionMessage(raw)
    if (message.type !== MESSAGE_TYPES.PAGE_PROBE_RESPONSE || message.requestId !== requestId) {
      return buildProbeFailure(requestId, 'EXTRACTION_FAILED')
    }
    return message
  } catch {
    return buildProbeFailure(requestId, 'EXTRACTION_FAILED')
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  let parsed: ExtensionMessage
  try {
    parsed = validateExtensionMessage(message)
  } catch {
    return false
  }

  switch (parsed.type) {
    case MESSAGE_TYPES.EXTRACT_ARTICLE_REQUEST:
      void handleExtractArticle(parsed.requestId, parsed.tabId, parsed.url).then(sendResponse)
      return true
    case MESSAGE_TYPES.GET_ACTIVE_TAB_REQUEST:
      void handleGetActiveTab(parsed.requestId).then(sendResponse)
      return true
    case MESSAGE_TYPES.PAGE_PROBE_REQUEST:
      void handlePageProbe(parsed.requestId).then(sendResponse)
      return true
    default:
      return false
  }
})
