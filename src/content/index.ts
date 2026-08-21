import {
  MESSAGE_PROTOCOL_VERSION,
  MESSAGE_TYPES,
  validateExtensionMessage,
} from '../shared/messaging/messages'
import type {
  ExtractArticleFailure,
  ExtractArticleSuccess,
  ExtensionMessage,
  PageProbe,
  PageProbeResponse,
} from '../shared/messaging/messages'
import { extractArticleAsArticle } from './extractors/extract-article'

/** 基于当前页面 DOM 生成轻量探针结果，不读取正文算法。 */
function buildPageProbe(doc: Document): PageProbe {
  const body = doc.body
  const visibleText = body ? body.innerText || body.textContent || '' : ''
  return {
    title: doc.title,
    url: doc.location.href,
    visibleTextLength: visibleText.length,
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  let parsed: ExtensionMessage
  try {
    parsed = validateExtensionMessage(message)
  } catch {
    return false
  }

  if (parsed.type === MESSAGE_TYPES.PAGE_PROBE_REQUEST) {
    const response: PageProbeResponse = {
      type: MESSAGE_TYPES.PAGE_PROBE_RESPONSE,
      protocolVersion: MESSAGE_PROTOCOL_VERSION,
      requestId: parsed.requestId,
      probe: buildPageProbe(document),
    }
    sendResponse(response)
    return false
  }

  if (parsed.type === MESSAGE_TYPES.EXTRACT_ARTICLE_REQUEST) {
    const article = extractArticleAsArticle(document, document.location.href)
    if (article) {
      const response: ExtractArticleSuccess = {
        type: MESSAGE_TYPES.EXTRACT_ARTICLE_SUCCESS,
        protocolVersion: MESSAGE_PROTOCOL_VERSION,
        requestId: parsed.requestId,
        article,
      }
      sendResponse(response)
    } else {
      const response: ExtractArticleFailure = {
        type: MESSAGE_TYPES.EXTRACT_ARTICLE_FAILURE,
        protocolVersion: MESSAGE_PROTOCOL_VERSION,
        requestId: parsed.requestId,
        errorCode: 'EXTRACTION_FAILED',
      }
      sendResponse(response)
    }
    return false
  }

  return false
})
