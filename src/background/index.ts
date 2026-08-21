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
    return tabs[0]
  } catch {
    return undefined
  }
}

async function handleGetActiveTab(requestId: string): Promise<GetActiveTabResponse> {
  const tab = await queryActiveTab()
  const url = tab?.url ?? ''
  const policy = evaluateTab(url)
  const info: ActiveTabInfo = {
    tabId: tab?.id ?? -1,
    title: tab?.title ?? '',
    url,
    domain: policy.domain,
    processable: policy.processable,
    reason: policy.reason,
  }
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
    if (
      tab?.id === undefined ||
      tab.id !== expectedTabId ||
      (tab.url ?? '') !== expectedUrl ||
      !evaluateTab(tab.url ?? '').processable
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
