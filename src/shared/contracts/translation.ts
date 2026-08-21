import type { AppErrorCode } from '../errors/app-error'
import { isRecord, isString } from './validation'

/** 翻译结果契约版本。结构不兼容变更时必须递增。 */
export const TRANSLATION_RESULT_VERSION = 1

/**
 * 最近一次完整成功翻译结果。
 * 不保存原始 HTML、流式中间片段、API Key 或多条历史结果。
 */
export interface TranslationResult {
  /** 数据契约版本 */
  version: number
  /** 原文页面 URL */
  sourceUrl: string
  /** 翻译后的标题 */
  title: string
  /** 作者；无法识别时为空字符串 */
  author: string
  /** 完整翻译 Markdown */
  markdown: string
  /** 完成时间（ISO 字符串） */
  completedAt: string
  /** 模型标识 */
  model: string
}

/** 校验外部载荷是否为合法的 TranslationResult，非法时抛错。 */
export function validateTranslationResult(input: unknown): TranslationResult {
  if (!isRecord(input)) {
    throw new Error('TranslationResult 载荷必须是对象')
  }
  if (input.version !== TRANSLATION_RESULT_VERSION) {
    throw new Error('TranslationResult 版本不受支持')
  }
  if (!isString(input.sourceUrl) || input.sourceUrl.length === 0) {
    throw new Error('TranslationResult.sourceUrl 必须是非空字符串')
  }
  if (!isString(input.title) || input.title.length === 0) {
    throw new Error('TranslationResult.title 必须是非空字符串')
  }
  if (!isString(input.author)) {
    throw new Error('TranslationResult.author 必须是字符串')
  }
  if (!isString(input.markdown) || input.markdown.length === 0) {
    throw new Error('TranslationResult.markdown 必须是非空字符串')
  }
  if (!isString(input.completedAt) || input.completedAt.length === 0) {
    throw new Error('TranslationResult.completedAt 必须是非空字符串')
  }
  if (!isString(input.model) || input.model.length === 0) {
    throw new Error('TranslationResult.model 必须是非空字符串')
  }
  return {
    version: input.version,
    sourceUrl: input.sourceUrl,
    title: input.title,
    author: input.author,
    markdown: input.markdown,
    completedAt: input.completedAt,
    model: input.model,
  }
}

/**
 * 翻译流程状态机（可辨识联合）。
 * 状态只允许按定义路径迁移，避免并发操作造成旧请求覆盖新请求。
 */
export type TranslationState =
  | { kind: 'idle' }
  | { kind: 'extracting' }
  | { kind: 'translating' }
  | { kind: 'completed'; result: TranslationResult }
  | { kind: 'failed'; errorCode: AppErrorCode }
  | { kind: 'cancelled' }
