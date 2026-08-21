import { AppError } from '../errors/app-error'
import { MESSAGE_PROTOCOL_VERSION, MESSAGE_TYPES, validateExtensionMessage } from './messages'
import type { ExtractedArticle } from '../contracts/article'
import type {
  ActiveTabInfo,
  ExtractArticleRequest,
  GetActiveTabRequest,
  PageProbe,
  PageProbeRequest,
} from './messages'

/** 生成唯一请求 ID，用于隔离重复请求、切换标签页与过期响应。 */
export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `req-${crypto.randomUUID()}`
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 断言后台响应与本次请求匹配，丢弃过期或串用的响应。 */
function assertMatchingResponse(response: { requestId: string }, requestId: string): void {
  if (response.requestId !== requestId) {
    throw new AppError('NETWORK_ERROR', '收到过期响应，已忽略。')
  }
}

/** 通过后台向当前活动标签页请求标准化文章。 */
export async function extractArticle(tabId: number, url: string): Promise<ExtractedArticle> {
  const request: ExtractArticleRequest = {
    type: MESSAGE_TYPES.EXTRACT_ARTICLE_REQUEST,
    protocolVersion: MESSAGE_PROTOCOL_VERSION,
    requestId: createRequestId(),
    tabId,
    url,
  }
  const raw: unknown = await chrome.runtime.sendMessage(request)
  const message = validateExtensionMessage(raw)
  assertMatchingResponse(message, request.requestId)
  if (message.type === MESSAGE_TYPES.EXTRACT_ARTICLE_FAILURE) {
    throw new AppError(message.errorCode, '文章提取失败。')
  }
  if (message.type !== MESSAGE_TYPES.EXTRACT_ARTICLE_SUCCESS) {
    throw new AppError('NETWORK_ERROR', '后台返回了意外响应。')
  }
  return message.article
}

/** 请求当前活动标签页的身份与可处理性。 */
export async function requestActiveTab(): Promise<ActiveTabInfo> {
  const request: GetActiveTabRequest = {
    type: MESSAGE_TYPES.GET_ACTIVE_TAB_REQUEST,
    protocolVersion: MESSAGE_PROTOCOL_VERSION,
    requestId: createRequestId(),
  }
  const raw: unknown = await chrome.runtime.sendMessage(request)
  const message = validateExtensionMessage(raw)
  assertMatchingResponse(message, request.requestId)
  if (message.type !== MESSAGE_TYPES.GET_ACTIVE_TAB_RESPONSE) {
    throw new AppError('NETWORK_ERROR', '后台返回了意外响应。')
  }
  return message.tab
}

/** 通过后台向内容脚本发送页面探针，返回标题、URL 与可见文本统计。 */
export async function probePage(): Promise<PageProbe> {
  const request: PageProbeRequest = {
    type: MESSAGE_TYPES.PAGE_PROBE_REQUEST,
    protocolVersion: MESSAGE_PROTOCOL_VERSION,
    requestId: createRequestId(),
  }
  const raw: unknown = await chrome.runtime.sendMessage(request)
  const message = validateExtensionMessage(raw)
  assertMatchingResponse(message, request.requestId)
  if (message.type === MESSAGE_TYPES.PAGE_PROBE_FAILURE) {
    throw new AppError(message.errorCode, '页面探针失败。')
  }
  if (message.type !== MESSAGE_TYPES.PAGE_PROBE_RESPONSE) {
    throw new AppError('NETWORK_ERROR', '后台返回了意外响应。')
  }
  return message.probe
}
