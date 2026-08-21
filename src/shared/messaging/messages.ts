import { validateExtractedArticle } from '../contracts/article'
import type { ExtractedArticle } from '../contracts/article'
import { isFiniteNumber, isRecord, isString } from '../contracts/validation'
import { isAppErrorCode } from '../errors/app-error'
import type { AppErrorCode } from '../errors/app-error'

/** 消息协议版本。载荷结构不兼容变更时必须递增。 */
export const MESSAGE_PROTOCOL_VERSION = 1

export const MESSAGE_TYPES = {
  EXTRACT_ARTICLE_REQUEST: 'EXTRACT_ARTICLE_REQUEST',
  EXTRACT_ARTICLE_SUCCESS: 'EXTRACT_ARTICLE_SUCCESS',
  EXTRACT_ARTICLE_FAILURE: 'EXTRACT_ARTICLE_FAILURE',
  GET_ACTIVE_TAB_REQUEST: 'GET_ACTIVE_TAB_REQUEST',
  GET_ACTIVE_TAB_RESPONSE: 'GET_ACTIVE_TAB_RESPONSE',
  PAGE_PROBE_REQUEST: 'PAGE_PROBE_REQUEST',
  PAGE_PROBE_RESPONSE: 'PAGE_PROBE_RESPONSE',
  PAGE_PROBE_FAILURE: 'PAGE_PROBE_FAILURE',
} as const

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES]

/** 内容提取请求。携带唯一请求 ID，以隔离重复点击和过期响应。 */
export interface ExtractArticleRequest {
  type: typeof MESSAGE_TYPES.EXTRACT_ARTICLE_REQUEST
  protocolVersion: number
  requestId: string
  tabId: number
  url: string
}

/** 内容提取成功响应，返回标准化文章对象。 */
export interface ExtractArticleSuccess {
  type: typeof MESSAGE_TYPES.EXTRACT_ARTICLE_SUCCESS
  protocolVersion: number
  requestId: string
  article: ExtractedArticle
}

/** 内容提取失败响应，仅传递统一错误码，不传递第三方异常对象。 */
export interface ExtractArticleFailure {
  type: typeof MESSAGE_TYPES.EXTRACT_ARTICLE_FAILURE
  protocolVersion: number
  requestId: string
  errorCode: AppErrorCode
}

/** 请求当前活动标签页的身份与可处理性。 */
export interface GetActiveTabRequest {
  type: typeof MESSAGE_TYPES.GET_ACTIVE_TAB_REQUEST
  protocolVersion: number
  requestId: string
}

/** 后台协调器返回的当前活动标签页摘要。 */
export interface ActiveTabInfo {
  /** 标签页 ID；无活动标签页时为 -1。 */
  tabId: number
  /** 标签页标题；可能为空字符串。 */
  title: string
  /** 标签页 URL；可能为空字符串。 */
  url: string
  /** 从 URL 提取的域名；受限或非法 URL 时为空字符串。 */
  domain: string
  /** 是否允许注入内容脚本并处理。 */
  processable: boolean
  /** 不可处理时的领域错误码，可处理时为 null。 */
  reason: AppErrorCode | null
}

export interface GetActiveTabResponse {
  type: typeof MESSAGE_TYPES.GET_ACTIVE_TAB_RESPONSE
  protocolVersion: number
  requestId: string
  tab: ActiveTabInfo
}

/** 页面探针请求：要求内容脚本返回标题、URL 与可见文本统计。 */
export interface PageProbeRequest {
  type: typeof MESSAGE_TYPES.PAGE_PROBE_REQUEST
  protocolVersion: number
  requestId: string
}

/** 页面探针结果：证明当前页面可被安全访问的轻量信号。 */
export interface PageProbe {
  title: string
  url: string
  /** 可见文本字符数，作为“页面存在正文”的简单信号。 */
  visibleTextLength: number
}

export interface PageProbeResponse {
  type: typeof MESSAGE_TYPES.PAGE_PROBE_RESPONSE
  protocolVersion: number
  requestId: string
  probe: PageProbe
}

/** 页面探针失败响应，仅传递统一错误码。 */
export interface PageProbeFailure {
  type: typeof MESSAGE_TYPES.PAGE_PROBE_FAILURE
  protocolVersion: number
  requestId: string
  errorCode: AppErrorCode
}

export type ExtensionMessage =
  | ExtractArticleRequest
  | ExtractArticleSuccess
  | ExtractArticleFailure
  | GetActiveTabRequest
  | GetActiveTabResponse
  | PageProbeRequest
  | PageProbeResponse
  | PageProbeFailure

function validateActiveTabInfo(input: unknown): ActiveTabInfo {
  if (!isRecord(input)) {
    throw new Error('ActiveTabInfo 载荷必须是对象')
  }
  if (!isFiniteNumber(input.tabId)) {
    throw new Error('ActiveTabInfo.tabId 必须是数字')
  }
  if (!isString(input.title)) {
    throw new Error('ActiveTabInfo.title 必须是字符串')
  }
  if (!isString(input.url)) {
    throw new Error('ActiveTabInfo.url 必须是字符串')
  }
  if (!isString(input.domain)) {
    throw new Error('ActiveTabInfo.domain 必须是字符串')
  }
  if (typeof input.processable !== 'boolean') {
    throw new Error('ActiveTabInfo.processable 必须是布尔值')
  }
  const reason: AppErrorCode | null =
    input.reason === null ? null : isAppErrorCode(input.reason) ? input.reason : null
  if (input.reason !== null && reason === null) {
    throw new Error('ActiveTabInfo.reason 必须是有效错误码或 null')
  }
  return {
    tabId: input.tabId,
    title: input.title,
    url: input.url,
    domain: input.domain,
    processable: input.processable,
    reason,
  }
}

function validatePageProbe(input: unknown): PageProbe {
  if (!isRecord(input)) {
    throw new Error('PageProbe 载荷必须是对象')
  }
  if (!isString(input.title)) {
    throw new Error('PageProbe.title 必须是字符串')
  }
  if (!isString(input.url)) {
    throw new Error('PageProbe.url 必须是字符串')
  }
  if (!isFiniteNumber(input.visibleTextLength) || input.visibleTextLength < 0) {
    throw new Error('PageProbe.visibleTextLength 必须是非负数字')
  }
  return {
    title: input.title,
    url: input.url,
    visibleTextLength: input.visibleTextLength,
  }
}

/** 校验外部载荷是否为合法的扩展消息，非法时抛错。 */
export function validateExtensionMessage(input: unknown): ExtensionMessage {
  if (!isRecord(input)) {
    throw new Error('扩展消息载荷必须是对象')
  }
  if (!isString(input.type)) {
    throw new Error('扩展消息缺少 type 字段')
  }
  if (input.protocolVersion !== MESSAGE_PROTOCOL_VERSION) {
    throw new Error('扩展消息协议版本不受支持')
  }
  if (!isString(input.requestId) || input.requestId.length === 0) {
    throw new Error('扩展消息缺少 requestId')
  }

  switch (input.type) {
    case MESSAGE_TYPES.EXTRACT_ARTICLE_REQUEST:
      if (!isFiniteNumber(input.tabId) || !isString(input.url)) {
        throw new Error('提取请求缺少有效的 tabId 或 url')
      }
      return {
        type: MESSAGE_TYPES.EXTRACT_ARTICLE_REQUEST,
        protocolVersion: input.protocolVersion,
        requestId: input.requestId,
        tabId: input.tabId,
        url: input.url,
      }
    case MESSAGE_TYPES.EXTRACT_ARTICLE_SUCCESS: {
      const article = validateExtractedArticle(input.article)
      return {
        type: MESSAGE_TYPES.EXTRACT_ARTICLE_SUCCESS,
        protocolVersion: input.protocolVersion,
        requestId: input.requestId,
        article,
      }
    }
    case MESSAGE_TYPES.EXTRACT_ARTICLE_FAILURE:
      if (!isAppErrorCode(input.errorCode)) {
        throw new Error('扩展消息缺少有效的 errorCode')
      }
      return {
        type: MESSAGE_TYPES.EXTRACT_ARTICLE_FAILURE,
        protocolVersion: input.protocolVersion,
        requestId: input.requestId,
        errorCode: input.errorCode,
      }
    case MESSAGE_TYPES.GET_ACTIVE_TAB_REQUEST:
      return {
        type: MESSAGE_TYPES.GET_ACTIVE_TAB_REQUEST,
        protocolVersion: input.protocolVersion,
        requestId: input.requestId,
      }
    case MESSAGE_TYPES.GET_ACTIVE_TAB_RESPONSE:
      return {
        type: MESSAGE_TYPES.GET_ACTIVE_TAB_RESPONSE,
        protocolVersion: input.protocolVersion,
        requestId: input.requestId,
        tab: validateActiveTabInfo(input.tab),
      }
    case MESSAGE_TYPES.PAGE_PROBE_REQUEST:
      return {
        type: MESSAGE_TYPES.PAGE_PROBE_REQUEST,
        protocolVersion: input.protocolVersion,
        requestId: input.requestId,
      }
    case MESSAGE_TYPES.PAGE_PROBE_RESPONSE:
      return {
        type: MESSAGE_TYPES.PAGE_PROBE_RESPONSE,
        protocolVersion: input.protocolVersion,
        requestId: input.requestId,
        probe: validatePageProbe(input.probe),
      }
    case MESSAGE_TYPES.PAGE_PROBE_FAILURE:
      if (!isAppErrorCode(input.errorCode)) {
        throw new Error('扩展消息缺少有效的 errorCode')
      }
      return {
        type: MESSAGE_TYPES.PAGE_PROBE_FAILURE,
        protocolVersion: input.protocolVersion,
        requestId: input.requestId,
        errorCode: input.errorCode,
      }
    default:
      throw new Error('扩展消息类型不受支持')
  }
}
