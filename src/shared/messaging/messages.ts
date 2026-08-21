import { validateExtractedArticle } from '../contracts/article'
import { isRecord, isString } from '../contracts/validation'
import type { ExtractedArticle } from '../contracts/article'
import { isAppErrorCode } from '../errors/app-error'
import type { AppErrorCode } from '../errors/app-error'

/** 消息协议版本。载荷结构不兼容变更时必须递增。 */
export const MESSAGE_PROTOCOL_VERSION = 1

export const MESSAGE_TYPES = {
  EXTRACT_ARTICLE_REQUEST: 'EXTRACT_ARTICLE_REQUEST',
  EXTRACT_ARTICLE_SUCCESS: 'EXTRACT_ARTICLE_SUCCESS',
  EXTRACT_ARTICLE_FAILURE: 'EXTRACT_ARTICLE_FAILURE',
} as const

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES]

/** 内容提取请求。携带唯一请求 ID，以隔离重复点击和过期响应。 */
export interface ExtractArticleRequest {
  type: typeof MESSAGE_TYPES.EXTRACT_ARTICLE_REQUEST
  protocolVersion: number
  requestId: string
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

export type ExtensionMessage =
  | ExtractArticleRequest
  | ExtractArticleSuccess
  | ExtractArticleFailure

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
      return {
        type: MESSAGE_TYPES.EXTRACT_ARTICLE_REQUEST,
        protocolVersion: input.protocolVersion,
        requestId: input.requestId,
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
    default:
      throw new Error('扩展消息类型不受支持')
  }
}
