import { isRecord, isString } from './validation'

/** 模型设置契约版本。结构不兼容变更时必须递增。 */
export const SETTINGS_CONTRACT_VERSION = 1

/**
 * 模型连接配置。
 * 仅包含发起 OpenAI 兼容请求所需字段，不包含正文、译文或调试信息。
 */
export interface ModelSettings {
  /** 数据契约版本 */
  version: number
  /** OpenAI 兼容服务地址 */
  baseUrl: string
  /** API Key，仅保存在本地扩展存储中 */
  apiKey: string
  /** 模型名称 */
  model: string
}

/** 校验外部载荷是否为合法的 ModelSettings，非法时抛错。 */
export function validateModelSettings(input: unknown): ModelSettings {
  if (!isRecord(input)) {
    throw new Error('ModelSettings 载荷必须是对象')
  }
  if (input.version !== SETTINGS_CONTRACT_VERSION) {
    throw new Error('ModelSettings 版本不受支持')
  }
  if (!isString(input.baseUrl) || input.baseUrl.length === 0) {
    throw new Error('ModelSettings.baseUrl 必须是非空字符串')
  }
  if (!isString(input.apiKey) || input.apiKey.length === 0) {
    throw new Error('ModelSettings.apiKey 必须是非空字符串')
  }
  if (!isString(input.model) || input.model.length === 0) {
    throw new Error('ModelSettings.model 必须是非空字符串')
  }
  return {
    version: input.version,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
  }
}
